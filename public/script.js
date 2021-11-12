var _file_obj = null;
var _submit = function(form) {
    // // Disable button and input form
    // form.getElementsByTagName('button')[0].setAttribute('disabled', 'disabled');
    // for (var input of form.getElementsByTagName('input')) {
    //     input.setAttribute('disabled', 'disabled');
    // }

    const modelbatch = document.getElementById('modelbatch').value;
    const modelwidth = document.getElementById('modelwidth').value;
    const modelheight = document.getElementById('modelheight').value;
    const configuration = `Run description: <code>filename=${_file_obj.name} batch=${modelbatch} inputsize=[${modelbatch} 3 ${modelheight} ${modelwidth}]</code> <br />`

    if (modelbatch === '' || modelwidth === '' || modelheight === '') {
        ddup.div_stat_header.innerHTML = `Invalid model width and height!`;
        return;
    }

    // request ajax
    ddup.div_stat_header.innerHTML = `RPi: processing <code>${_file_obj.name}</code> ...`;
    ddup.div_stat_body.innerHTML = configuration + `Waiting for pi to bootstrap ... <code>bootstraping=<span id="bootstrap-timer">${ddup.timeout_bootstrap / 1000}</span></code>`;

    ddup.timer = setInterval(function() {
        let elem = document.getElementById("bootstrap-timer")
        let current_sec = parseInt(elem.innerText);
        elem.innerText = `${current_sec - 1}`;
        if (current_sec == 0) {
            clearInterval(ddup.timer);

            ddup.div_stat_body.innerHTML = configuration + `Hang tight! we will notify you when something goes wrong ...<br />Waiting for pi to infer ... <code>infer_timeout=<span id="infer-timer">${ddup.timeout / 1000}</span></code>`;
            ddup.timer = setInterval(function() {
                let elem = document.getElementById("infer-timer")
                let current_sec = parseInt(elem.innerText);
                elem.innerText = `${current_sec - 1}`;
                if (current_sec == 0) {
                    clearInterval(ddup.timer);
                    ddup.timer = null;
                }
            }, 1000);
        }
    }, 1000);

    let data = new FormData();
    data.append('torchscript', _file_obj);
    data.append('modelbatch', modelbatch);
    data.append('modelwidth', modelwidth);
    data.append('modelheight', modelheight);

    let xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload');
    xhr.timeout = ddup.timeout_bootstrap + ddup.timeout;
    xhr.onload = function () {
        clearInterval(ddup.timer);
        ddup.timer = null;
        response_json = JSON.parse(xhr.response);

        if (response_json.error) {
            stdout_message = '';
            console.dir(response_json);
            if (response_json.stdout)
                stdout_message = "<br />Stdout: <code>" + response_json.stdout + "</code>";

            ddup.div_stat_header.innerHTML = `Job failed: <code>${_file_obj.name}</code>`;
            ddup.div_stat_body.innerHTML = configuration + `Error message: ${response_json.error}` + stdout_message;

            ddup.div_zone.classList.remove('bg-light');
            ddup.div_zone.classList.add('bg-dark');
            ddup.div_zone.classList.add('text-light');
        } else {
            response_body = response_json.output;
            output = response_body.substring(response_body.indexOf('==== Cut below'));
            // while (output.indexOf('\n') != -1)
            //     output = output.replace('\n', '<br />');

            ddup.div_stat_header.innerHTML = `Job success: <code>${_file_obj.name}</code>`;
            ddup.div_stat_body.innerHTML = configuration + `<textarea class="form-control" style="height: 350px; white-space: pre-wrap; font-family: D2Coding Ligature, D2Coding, monospace; font-size: 0.8em;">${output}</textarea>`;
        }
    }
    xhr.ontimeout = function () {
        clearInterval(ddup.timer);
        ddup.timer = null;
        ddup.div_stat_header.innerHTML = `Failed job <code>${_file_obj.name}</code>: <code>Timeout</code>`;
        ddup.div_stat_body.innerHTML = configuration + "Server might be still doing inference task, check server." + ddup.try_again_message;
        ddup.div_zone.classList.remove('bg-light');
        ddup.div_zone.classList.add('bg-dark');
        ddup.div_zone.classList.add('text-light');
    }
    xhr.onerror = function (e) {
        clearInterval(ddup.timer);
        ddup.timer = null;
        ddup.div_stat_header.innerHTML = `Failed`;
        ddup.div_stat_body.innerHTML = configuration + `Upload <code>${_file_obj.name}</code> failed: AJAX Error <code>${e.target.status}</code>` + ddup.try_again_message;
        ddup.div_zone.classList.remove('bg-light');
        ddup.div_zone.classList.add('bg-dark');
        ddup.div_zone.classList.add('text-light');
    }
    xhr.send(data);
};

var ddup = {
    // (A) ON PAGE LOAD
    div_zone: null, // HTML upload zone
    div_stat_inner: null, // HTML upload status body
    div_stat_header: null, // HTML upload status header
    div_stat_body: null, // HTML upload status body
    try_again_message: `<br />Drag&drop in another moment to try again!`,
    timeout_bootstrap: 20000,
    timeout: 120000,
    timer: null,

    check_file_type: function(e) {
        for (var type of e.dataTransfer.types)
            if (type == 'Files')
                return true;
        return false;
    },

    init_body: function() {
        ddup.div_stat_header.innerHTML = `Upload <code>*.torchscript</code>`;
        ddup.div_stat_body.innerHTML = `Drag & drop <code>*.torchscript</code> file here!`;
    },

    init: function () {
        // (A1) GET HTML ELEMENTS
        ddup.div_zone = document.getElementById("upload-div");
        ddup.div_stat_inner = document.getElementById("upload-div-inner");
        ddup.div_stat_header = document.getElementById("upload-header");
        ddup.div_stat_body = document.getElementById("upload-body");

        ddup.init_body();

        if (window.File && window.FileReader && window.FileList && window.Blob) {
            ddup.div_zone.addEventListener("dragenter", function (e) {
                // Exit on inferencing status
                if (ddup.timer != null)
                    return;

                // Exit on text drag
                if(!ddup.check_file_type(e))
                    return;

                ddup.init_body();
                ddup.div_stat_inner.classList.add('noevt');

                e.preventDefault();
                e.stopPropagation();
                ddup.div_zone.classList.remove('bg-light');
                ddup.div_zone.classList.add('bg-dark');
                ddup.div_zone.classList.add('text-light');
            });
            ddup.div_zone.addEventListener("dragleave", function (e) {
                e.preventDefault();
                e.stopPropagation();
                ddup.div_zone.classList.remove('bg-dark');
                ddup.div_zone.classList.remove('text-light');
                ddup.div_zone.classList.add('bg-light');
            });

            // DROP TO UPLOAD FILE
            ddup.div_zone.addEventListener("dragover", function (e) {
                e.preventDefault();
                e.stopPropagation();
            });
            ddup.div_zone.addEventListener("drop", function (e) {
                e.preventDefault();
                e.stopPropagation();
                
                // Exit on inferencing status
                if (ddup.timer != null)
                    return;
                
                // Exit on text drag
                if(!ddup.check_file_type(e))
                    return;

                ddup.div_stat_inner.classList.remove('noevt');
                ddup.div_zone.classList.remove('bg-dark');
                ddup.div_zone.classList.remove('text-light');
                ddup.div_zone.classList.add('bg-light');

                _file_obj = e.dataTransfer.files[0];
                if (!_file_obj.name.toLowerCase().endsWith(".torchscript")) {
                    ddup.div_stat_header.innerHTML = `Wrong file <code>${_file_obj.name}</code>`;
                    ddup.div_stat_body.innerHTML = `You should upload <code>*.torchscript</code> file to infer!` + ddup.try_again_message;
                    ddup.div_zone.classList.remove('bg-light');
                    ddup.div_zone.classList.add('bg-dark');
                    ddup.div_zone.classList.add('text-light');

                    _file_obj = null;
                    return;
                }

                ddup.div_stat_header.innerHTML = `Job: <code>${_file_obj.name}</code>`;
                ddup.div_stat_body.innerHTML = `
                    <form class="row gy-2 gx-3" action="" onsubmit="_submit(this); return false">
                        <div class="col-auto match-text-col">
                            <span>Model input size: </span>
                        </div>
                        <div class="col-auto">
                            <input id="modelbatch" type="text" class="form-control" placeholder="B=1">
                        </div>
                        <div class="col-auto match-text-col">
                            <span> * 3 * </span>
                        </div>
                        <div class="col-auto">
                            <input id="modelheight" type="text" class="form-control" placeholder="H=380">
                        </div>
                        <div class="col-auto">
                            <input id="modelwidth" type="text" class="form-control" placeholder="W=640">
                        </div>
                        <div class="col-auto">
                            <button class="btn btn-primary" type="submit">Infer</button>
                        </div>
                    </form>
                `;
                
                document.getElementById('modelbatch').value = '1';
                document.getElementById('modelheight').focus();
            });
        }

        else {
            ddup.div_zone.classList.remove('bg-dark');
            ddup.div_zone.classList.remove('text-light');
            ddup.div_zone.classList.add('bg-light');
        }
    }
}
window.addEventListener("DOMContentLoaded", ddup.init);