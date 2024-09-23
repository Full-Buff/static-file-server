var modal = document.getElementById('uploadModal');
var btn = document.getElementById('uploadBtn');
var span = document.getElementsByClassName('close')[0];
if (btn) {
    btn.onclick = function() {
        modal.style.display = 'block';
    }
}
if (span) {
    span.onclick = function() {
        modal.style.display = 'none';
    }
}
window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}
