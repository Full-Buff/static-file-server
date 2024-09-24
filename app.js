const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const app = express();

// Load configuration
const configPath = process.env.CONFIG_PATH || path.join(__dirname, 'config.json');
let config;
try {
    console.log(`Loading configuration from ${configPath}`);
    config = require(configPath);
    console.log('Configuration loaded:', JSON.stringify(config, null, 2));
} catch (err) {
    console.error(`Failed to load configuration file at ${configPath}:`, err);
    process.exit(1);
}

// Configuration variables
const PORT = 8080; // Static internal port
const FILES_DIR = config.filesDir || '/files';
const UPLOAD_ENABLED = config.uploadEnabled === true;
const UPLOAD_RULES_RAW = config.uploadRules || {};

// Function to parse size strings (e.g., "50MB") into bytes
function parseSize(sizeStr) {
    const units = {
        B: 1,
        KB: 1024,
        MB: 1024 * 1024,
        GB: 1024 * 1024 * 1024,
    };
    const regex = /^(\d+)(B|KB|MB|GB)$/i;
    const match = sizeStr.trim().match(regex);
    if (!match) {
        throw new Error(`Invalid size format: '${sizeStr}'`);
    }
    const value = parseInt(match[1], 10);
    const unit = match[2].toUpperCase();
    return value * units[unit];
}

// Normalize upload rules keys and derive allowed upload directories
const UPLOAD_RULES = {};
const UPLOAD_DIRS = Object.keys(UPLOAD_RULES_RAW).map(normalizePath);

for (const [key, value] of Object.entries(UPLOAD_RULES_RAW)) {
    const normalizedKey = normalizePath(key);
    const rule = { ...value };

    // Parse maxFileSize if it's a string
    if (typeof rule.maxFileSize === 'string') {
        try {
            rule.maxFileSizeBytes = parseSize(rule.maxFileSize);
        } catch (err) {
            console.error(`Error parsing maxFileSize for '${normalizedKey}': ${err.message}`);
            process.exit(1);
        }
    } else if (typeof rule.maxFileSize === 'number') {
        rule.maxFileSizeBytes = rule.maxFileSize;
    }

    UPLOAD_RULES[normalizedKey] = rule;
}

console.log('Allowed upload directories:', UPLOAD_DIRS);
console.log('Normalized UPLOAD_RULES keys:', Object.keys(UPLOAD_RULES));

// Map of validation functions
const validationFunctions = {
    'validateBspFile': validateBspFile
};

// Set up view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(FILES_DIR, { index: false }));

// Helper function to normalize paths
function normalizePath(dir) {
    return path.posix.normalize('/' + dir).replace(/\/+$/, '');
}

// Helper function to check if a directory is allowed for upload
function isUploadAllowed(dir) {
    dir = normalizePath(dir);
    console.log(`Checking if upload is allowed for directory: '${dir}'`);
    const allowed = UPLOAD_DIRS.includes(dir);
    console.log(`Upload allowed: ${allowed}`);
    return allowed;
}

// Set up Multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = normalizePath(req.body.path || '/');
        const saveDir = path.join(FILES_DIR, uploadPath);
        cb(null, saveDir);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

// Multer upload instance
const upload = multer({
    storage: storage,
    limits: { fileSize: parseSize('200MB') }, // Global max file size
    fileFilter: function (req, file, cb) {
        // Allow all files; we'll perform validation later
        cb(null, true);
    }
});

// Implement Rate Limiting
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many upload attempts from this IP, please try again after 15 minutes.'
});

// Upload route using Multer and rate limiter
app.post('/upload', uploadLimiter, upload.single('file'), async (req, res) => {

    console.log(`FILES_DIR: ${FILES_DIR}`);

    try {
        if (!UPLOAD_ENABLED) {
            console.log('Uploads are disabled');
            return res.status(403).json({ error: 'Uploads are disabled' });
        }
        const uploadPath = normalizePath(req.body.path || '/');
        console.log(`Received upload request for path: '${uploadPath}'`);

        if (!isUploadAllowed(uploadPath)) {
            console.log(`Uploads are not allowed to directory: '${uploadPath}'`);
            return res.status(403).json({ error: 'Uploads are not allowed to this directory' });
        }

        // Get the upload rules for this directory
        const rules = UPLOAD_RULES[uploadPath];
        console.log(`Applying upload rules for path '${uploadPath}':`, JSON.stringify(rules, null, 2));

        if (!req.file) {
            console.log('No file was uploaded.');
            return res.status(400).json({ error: 'No file was uploaded.' });
        }

        const uploadedFile = req.file;
        console.log(`Uploaded file: '${uploadedFile.originalname}', size: ${uploadedFile.size} bytes`);

        const filePath = uploadedFile.path;

        // Check file size limit
        if (rules.maxFileSizeBytes && uploadedFile.size > rules.maxFileSizeBytes) {
            console.log(`File size ${uploadedFile.size} exceeds limit of ${rules.maxFileSizeBytes}`);
            // Delete the file since it exceeds the size limit
            fs.unlink(filePath, () => {});
            return res.status(400).json({ error: `File size exceeds the limit of ${rules.maxFileSize}` });
        }

        // Check file extension
        const fileExtension = path.extname(uploadedFile.originalname).toLowerCase();
        const allowedExtensions = rules.allowedExtensions || ['*'];
        console.log(`File extension: '${fileExtension}', allowed extensions: ${JSON.stringify(allowedExtensions)}`);

        if (!allowedExtensions.includes('*') && !allowedExtensions.includes(fileExtension)) {
            console.log(`File extension '${fileExtension}' is not allowed`);
            // Delete the file since it's not allowed
            fs.unlink(filePath, () => {});
            return res.status(400).json({ error: `File type ${fileExtension} is not allowed in this directory.` });
        }

        // Additional validation
        if (rules.validateFile) {
            const validateFunc = validationFunctions[rules.validateFile];
            if (validateFunc) {
                try {
                    console.log(`Running validation function: '${rules.validateFile}'`);
                    // Pass the file path to the validation function
                    await validateFunc(filePath);
                    console.log('File passed validation');
                } catch (err) {
                    console.log(`File validation failed: ${err.message}`);
                    // Delete the file since validation failed
                    fs.unlink(filePath, () => {});
                    return res.status(400).json({ error: `File validation failed: ${err.message}` });
                }
            } else {
                console.log(`Validation function '${rules.validateFile}' not found`);
                // Delete the file
                fs.unlink(filePath, () => {});
                return res.status(500).json({ error: `Validation function ${rules.validateFile} not found.` });
            }
        }

        // Check if file already exists (after upload to temp location)
        const finalPath = path.join(FILES_DIR, uploadPath, uploadedFile.originalname);
        if (fs.existsSync(finalPath)) {
            console.log(`File '${uploadedFile.originalname}' already exists at '${finalPath}'`);
            // Delete the uploaded file
            fs.unlink(filePath, () => {});
            return res.status(400).json({ error: `File '${uploadedFile.originalname}' already exists.` });
        }

        // File has passed all checks and is already saved in the correct location
        console.log('File uploaded successfully');
        res.json({ success: true });
        
    } catch (err) {
        console.error('Unexpected error during file upload:', err);
        res.status(500).json({ error: 'An unexpected error occurred during file upload.' });
    }

    console.log(`Temp file path (before saving): ${filePath}`);
    console.log(`Final path for file existence check: ${finalPath}`);

});

// Validate .bsp files
async function validateBspFile(filePath) {
    // Read the first 4 bytes to check the magic number
    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath, { start: 0, end: 3 });
        let buffer = Buffer.alloc(4);
        stream.on('data', (chunk) => {
            buffer = chunk;
        });
        stream.on('end', () => {
            const magicNumber = buffer.toString('utf8');
            console.log(`Validating BSP file, magic number: '${magicNumber}'`);
            if (magicNumber !== 'VBSP') {
                reject(new Error('Invalid BSP file.'));
            } else {
                resolve();
            }
        });
        stream.on('error', (err) => {
            reject(err);
        });
    });
}

// Endpoint to get upload rules for a specific path
app.get('/uploadRules', (req, res) => {
    const requestedPath = normalizePath(req.query.path || '/');
    console.log(`Received request for upload rules for path: '${requestedPath}'`);

    if (!isUploadAllowed(requestedPath)) {
        console.log(`Uploads are not allowed to directory: '${requestedPath}'`);
        return res.status(403).json({ error: 'Uploads are not allowed to this directory.' });
    }

    const rules = UPLOAD_RULES[requestedPath];
    if (rules) {
        res.json({
            maxFileSize: rules.maxFileSize,
            maxFileSizeBytes: rules.maxFileSizeBytes,
            allowedExtensions: rules.allowedExtensions,
            validateFile: rules.validateFile
        });
    } else {
        res.status(404).json({ error: 'Upload rules not found for the specified path.' });
    }
});

// Route to display directory listing
app.get('/*', (req, res, next) => {
    const requestedPath = path.join(FILES_DIR, req.path);
    console.log(`Received GET request for path: '${req.path}', mapped to '${requestedPath}'`);
    fs.stat(requestedPath, (err, stats) => {
        if (err) {
            console.log(`Error accessing path '${requestedPath}': ${err}`);
            next(); // Pass to next middleware
            return;
        }
        if (stats.isDirectory()) {
            fs.readdir(requestedPath, (err, files) => {
                if (err) {
                    console.error(`Error reading directory '${requestedPath}': ${err}`);
                    res.status(500).send('Server Error');
                    return;
                }
                files = files.map(file => {
                    const fullPath = path.join(requestedPath, file);
                    const isDirectory = fs.statSync(fullPath).isDirectory();
                    return {
                        name: file,
                        isDirectory: isDirectory,
                        href: path.posix.join(req.path, file) + (isDirectory ? '/' : '')
                    };
                });

                // Sort files: directories first, then files, both alphabetically
                files.sort((a, b) => {
                    if (a.isDirectory && !b.isDirectory) {
                        return -1;
                    } else if (!a.isDirectory && b.isDirectory) {
                        return 1;
                    } else {
                        return a.name.localeCompare(b.name);
                    }
                });

                const uploadAllowed = UPLOAD_ENABLED && isUploadAllowed(req.path);
                console.log(`Rendering directory listing for '${req.path}', upload allowed: ${uploadAllowed}`);
                res.render('index', {
                    currentPath: req.path,
                    files: files,
                    uploadAllowed: uploadAllowed
                });
            });
        } else {
            console.log(`Path '${requestedPath}' is not a directory`);
            next();
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
