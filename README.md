# static-file-server

A simple static file server written in Node.js.

This server can be configured to limit the rate of uploads, allow/disallow uploads, and set the maximum file size for uploads. The configuration is stored in a JSON file, which must be named `config.json` and placed in the same directory as the server script.

The supported values in the `config.json` file are:

- `filesDir`: The path to the directory containing the files to be served. Defaults to `/files`.
- `uploadEnabled`: A boolean indicating whether uploads should be allowed. Defaults to `true`.
- `uploadRules`: An object with keys corresponding to the paths in the `filesDir` where uploads should be allowed. The value of each key is an object with the following properties:
  - `allowedExtensions`: An array of strings indicating the allowed file extensions. The `*` character can be used to allow all extensions.
  - `maxFileSize`: A string indicating the maximum allowed file size. The string should be in the format of `1MB`, `2GB`, etc.
  - `validateFile`: The name of a function in the `validationFunctions` object that should be called to validate the uploaded file. The function should take a single string argument, the path to the temporary file, and return a Promise that resolves if the file is valid, and rejects otherwise.

The `validationFunctions` object has the following functions:

- `validateBspFile`: A function that checks if the uploaded file is a valid TF2 map file.

There are plans to make validation functions extensible, but right now they are hard coded into the `app.js` file.

![image](https://github.com/user-attachments/assets/d338f2e4-63c6-4e3f-969c-fc9622d75eeb)

![image](https://github.com/user-attachments/assets/5d74d668-7e83-4e85-9ee9-58313ed5b272)
