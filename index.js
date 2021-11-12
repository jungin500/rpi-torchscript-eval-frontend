process.on('SIGINT', function() {
    console.log("Got SIGINT, Terminating");
    process.exit();
});

const express = require('express');
const serveStatic = require('serve-static');
const { exec } = require('child_process');
const multer  = require('multer')
const upload = multer({ dest: 'uploads/' });

const ssh_options = '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null';

const app = express();
const router = express.Router();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Runtime Options
RPI_SSH_ADDR = 'IP_ADDRESS_HERE'
RPI_SSH_USERNAME = 'pi'
RPI_SSH_PRIVATE_KEY_PATH = 'sshkeys/id_ecdsa'

RPI_CPUBURN_PATH = '~/'
RPI_CPUBURN_BINARY_NAME = 'cpuburn-a53'

RPI_EVAL_TOOLKIT_PATH = '/home/pi/rpi-torchscript-eval-toolkit'
RPI_CONDA_ENV_NAME = 'torch'

router.post('/upload', upload.single('torchscript'), (req, res) => {
    console.log(req.file);
    filename = req.file.originalname
    filepath = req.file.path

    const batch = req.body.modelbatch;
    const width = req.body.modelwidth;
    const height = req.body.modelheight;

    console.log(`Model inference ${filename} at ${batch}x3x${height}x${width} (Pseudo image size ${width}x${height}) started`);
    
    let cmd1 = `ssh ${ssh_options} -i ${RPI_SSH_PRIVATE_KEY_PATH} ${RPI_SSH_USERNAME}@${RPI_SSH_ADDR} /usr/bin/pkill -f 'python benchmark-batched.py'`
    console.log(`Killing previous python executables: ${cmd1}`);
    exec(cmd1);

    let cmd2 = `scp ${ssh_options} -i ${RPI_SSH_PRIVATE_KEY_PATH} ${filepath} ${RPI_SSH_USERNAME}@${RPI_SSH_ADDR}:/tmp/${filename}`
    console.log(`Uploading to server: ${cmd2}`);
    exec(cmd2, (error, stdout, stderr) => {
        if (error) {
            console.log(error);
            res.json({
                'error': error.message
            });
            return;
        }

        let cmd3_base = `set -x && (${RPI_CPUBURN_PATH}/${RPI_CPUBURN_BINARY_NAME} &) && sleep 1 && ` + 
            `CPUFREQ=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq) && pkill ${RPI_CPUBURN_BINARY_NAME} && ` + 
            `if [ "$CPUFREQ" -lt "1400000" ]; then echo "$CPUFREQ $(vcgencmd get_throttled)"; exit 1; fi`;
        let cmd3 = `ssh ${ssh_options} -i ${RPI_SSH_PRIVATE_KEY_PATH} ${RPI_SSH_USERNAME}@${RPI_SSH_ADDR} /bin/bash -c "${cmd3_base}"`
        console.log(`Checking if device is not throttled: ${cmd3}`);
        
        exec(cmd3, (e1, so1, se1) => {
            if(e1) {
                // device is throttled; exit 1 was triggered
                console.log(`Device is throttled`);
                res.json({
                    'error': "Device is throttled!",
                    'stdout': so1
                });
                return;
            }

            // Device is not throttled
            console.log('Device is not throttled');

            let cmd = `set -x >/dev/null && mv '/tmp/${filename}' '${RPI_EVAL_TOOLKIT_PATH}/client/${filename}' ` +
                    `&& cd ${RPI_EVAL_TOOLKIT_PATH}/client && conda activate ${RPI_CONDA_ENV_NAME} ` +
                    `&& python benchmark-batched.py ${filename} ${width} ${height} ${batch} 2> >(grep -v "OpenBLAS")`
            console.log(`Starting inference with command "${cmd}"`);

            exec(`ssh ${ssh_options} -i ${RPI_SSH_PRIVATE_KEY_PATH} ${RPI_SSH_USERNAME}@${RPI_SSH_ADDR} /bin/bash -c "${cmd}"`, (e1, so1, se1) => {
                if(e1) {
                    // if (se1) {
                    //     res.json({
                    //         'error': "InferError",
                    //         'stdout': so1
                    //     });
                    //     return;
                    // }
                    if (!so1) {
                        so1 = '';
                    }

                    let err_body_start_ptr = so1.toLowerCase().indexOf('traceback');
                    if (err_body_start_ptr == -1) {
                        error_body = so1;
                    } else {
                        error_body = so1.substring(err_body_start_ptr);
                    }
                    
                    console.log("Stdout below");
                    console.log(so1);
                    console.log("Stderr below");
                    console.log(se1);
                    res.json({
                        'error': "InferError",
                        'stdout': error_body
                    });
                    return;
                }

                console.log(`Run success, output:`);
                console.log(so1);

                res.json({
                    'output': so1
                });
            });
        });
    });
});

app.use(router);
app.use(serveStatic('public', { index: ['index.htm', 'index.html'] }));

app.listen(8080, function () {
    console.log("Listening on port 8080");
});