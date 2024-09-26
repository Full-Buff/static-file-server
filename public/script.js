var modal = document.getElementById('uploadModal');
var btn = document.getElementById('uploadBtn');
var span = document.getElementsByClassName('close')[0];
var errorMessage = document.getElementById('errorMessage');
var uploadForm = document.getElementById('uploadForm');

if (btn) {
    btn.onclick = function() {
        modal.style.display = 'block';
        errorMessage.innerText = ''; // Clear any previous error messages
    }
}
if (span) {
    span.onclick = function() {
        modal.style.display = 'none';
        errorMessage.innerText = '';
    }
}
window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = 'none';
        errorMessage.innerText = '';
    }
}

if (uploadForm) {
    uploadForm.addEventListener('submit', function(event) {
        event.preventDefault(); // Prevent default form submission

        var formData = new FormData(uploadForm);
        var fileInput = uploadForm.querySelector('input[type="file"]');
        var file = fileInput.files[0];
        var submitButton = uploadForm.querySelector('input[type="submit"]');
        var loadingIcon = document.getElementById('loadingIcon');

        // Client-side validation
        if (!file) {
            errorMessage.innerText = 'No file selected.';
            return;
        }

        // Disable the submit button and file input
        submitButton.disabled = true;
        fileInput.disabled = true;

        // Show the loading icon
        loadingIcon.style.display = 'block';

        // Proceed to upload
        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(async function(response) {
            // Re-enable the submit button and file input
            submitButton.disabled = false;
            fileInput.disabled = false;

            // Hide the loading icon
            loadingIcon.style.display = 'none';

            if (response.ok) {
                // Success
                modal.style.display = 'none';
                errorMessage.innerText = '';
                // Reload the page to show the new file
                window.location.reload();
            } else {
                // Error
                var data = await response.json();
                errorMessage.innerText = data.error || 'An error occurred during upload.';
            }
        })
        .catch(function(error) {
            // Re-enable the submit button and file input
            submitButton.disabled = false;
            fileInput.disabled = false;

            // Hide the loading icon
            loadingIcon.style.display = 'none';

            console.error('Error:', error);
            errorMessage.innerText = 'An error occurred during upload.';
        });
    });
}
