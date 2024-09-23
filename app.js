const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');

const app = express();

// Configuration
const PORT = 8080;
const FILES_DIR = process.env.FILES_DIR || '/files'; // Directory to serve files from
const UPLOAD_ENABLED = process.env.UPLOAD_ENABLED === 'true'; // Enable or disable upload
const UPLOAD_DIRS = (process.env.UPLOAD_DIRS || '').split(',')
    .map(dir => path.posix.normalize('/' + dir.trim()).replace(/\/+$/, ''))
    .filter(dir => dir);

console.log('Upload Enabled:', UPLOAD_ENABLED);
console.log('Upload Directories:', UPLOAD_DIRS);

// Set up view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(FILES_DIR, { index: false }));

// Helper function to check if a directory is allowed for upload
function isUploadAllowed(dir) {
    dir = path.posix.normalize(dir).replace(/\/+$/, '');
    return UPLOAD_DIRS.includes(dir);
}

// Route to display directory listing
app.get('/*', (req, res, next) => {
    const requestedPath = path.join(FILES_DIR, req.path);
    fs.stat(requestedPath, (err, stats) => {
        if (err) {
            next(); // Pass to next middleware
            return;
        }
        if (stats.isDirectory()) {
            fs.readdir(requestedPath, (err, files) => {
                if (err) {
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

                res.render('index', {
                    currentPath: req.path,
                    files: files,
                    uploadAllowed: UPLOAD_ENABLED && isUploadAllowed(req.path)
                });
            });
        } else {
            next();
        }
    });
});

// Upload route
app.post('/upload', (req, res) => {
    if (!UPLOAD_ENABLED) {
        res.status(403).send('Uploads are disabled');
        return;
    }
    const uploadPath = req.body.path || '/';
    if (!isUploadAllowed(uploadPath)) {
        res.status(403).send('Uploads are not allowed to this directory');
        return;
    }
    if (!req.files || Object.keys(req.files).length === 0) {
        res.status(400).send('No files were uploaded.');
        return;
    }
    const uploadedFile = req.files.file;
    const savePath = path.join(FILES_DIR, uploadPath, uploadedFile.name);
    uploadedFile.mv(savePath, function(err) {
        if (err) {
            return res.status(500).send(err);
        }
        res.redirect(uploadPath);
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
