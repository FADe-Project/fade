import {promises as fs} from 'fs';
import tar from 'tar-stream';
import rimraf from 'rimraf';
import zlib from 'zlib';
import tarfs from 'tar-fs';
import { FADeConfiguration } from '../utils'

const debTypes = {
    service: 'service',
    systemd: 'service',
    isolated: 'isolated',
    normal: 'normal'
};
const arMagicHeader = Buffer.from("!<arch>\n", "utf-8");
const debianbinaryData = Buffer.from("2.0\n");
const debianbinaryHeaderRaw = {
    filename: "debian-binary",
    timestamp: Math.floor(Date.now()/1000),
    owner_id: 0,
    group_id: 0,
    filemode: 100644,
    filesize: 4
} as arHeaderRaw;
const debianbinaryHeader = genArHeader(debianbinaryHeaderRaw);
export { debTypes, arMagicHeader, debianbinaryData, debianbinaryHeader}

export interface arHeaderRaw {
    filename: string,
    timestamp: number,
    owner_id: number,
    group_id: number,
    filemode: number,
    filesize: number
}

export function genArHeader(input: arHeaderRaw): Buffer {
    // REF: https://en.wikipedia.org/wiki/Ar_%28Unix%29
    let buf = Buffer.alloc(60, 0x20);
    buf.write(input.filename, 0);
    buf.write(input.timestamp.toString(), 16);
    buf.write(input.owner_id.toString(), 28);
    buf.write(input.group_id.toString(), 34);
    buf.write(input.filemode.toString(), 40);
    buf.write(input.filesize.toString(), 48);
    buf.write('`\n', 58);
    return buf;
}

export interface controlTarGzRaw {
    control: string,
    postinst: string,
    prerm: string
}

function addComma(depends: Array<string>): string {
    let commadeps = "";
    depends.forEach((item, index) => {
        commadeps += (index !== 0) ? ", " : '';
        commadeps += item;
    });
    return commadeps;
}

export function genControl(input: FADeConfiguration): string {
    return `Package: ${input.name}
Version: ${input.version}
Priority: ${input.priority}
Architecture: ${input.architecture}
Maintainer: ${input.maintainer_name} <${input.maintainer_email}>
${(input.depends.length === 0)?"":`Depends: ${addComma(input.depends)}`}
Homepage: ${input.url}
Description: ${input.desc}
`
}

export function genPreRm(input: FADeConfiguration): string {
    return `#!/bin/bash
${input.prerm_payload}
${(input.type == debTypes.service)?`
if [ "$(uname)" != "Linux" ]; then
    sleep 1
elif ( strings /proc/1/exe | grep -q "/lib/systemd" ); then
    systemctl stop ${input.name}
    systemctl disable ${input.name}
    rm /lib/systemd/system/${input.name}.service
    systemctl daemon-reload
elif ( strings /proc/1/exe | grep -q "sysvinit" ); then
    /etc/init.d/${input.name} stop
    update-rc.d -f ${input.name} remove
    rm -f /etc/init.d/${input.name}
fi
`:''}
${(input.type == debTypes.isolated || input.type == debTypes.service)?`
killall -9 -u ${input.name}
userdel ${input.name}
`:''}
rm -rf /usr/lib/${input.name}
mkdir /usr/lib/${input.name}`;
}

export function genPostInst(input: FADeConfiguration): string {
    return `#!/bin/bash
${(input.type == debTypes.service)?`
useradd -r -s /sbin/nologin -g nogroup -d /usr/lib/${input.name} -c "${input.desc}" ${input.name}
chown -R ${input.name}:root /usr/lib/${input.name}
`:''}
echo "${input.name} v${input.version} by ${input.maintainer_name} <${input.maintainer_email}>"
${input.postinst_payload}
${(input.type == debTypes.service)?`
if [ "$(uname)" != "Linux" ]; then
    echo "Sorry, but this package is only installable on Linux system."
    exit 1
elif ( strings /proc/1/exe | grep -q "/lib/systemd" ); then
    cat >> /lib/systemd/system/${input.name}.service << EOF
[Unit]
Description=${input.desc}
[Service]
Type=simple
User=${input.name}
WorkingDirectory=/usr/lib/${input.name}
ExecStart=/bin/bash -c "cd /usr/lib/${input.name};${input.run.replace(/"/g,"\\\"").replace(/'/g,"\\\'")}"
[Install]
WantedBy=multi-user.target
EOF
    chmod 644 /lib/systemd/system/${input.name}.service
    systemctl daemon-reload
    systemctl enable ${input.name}
    systemctl start ${input.name}
elif ( strings /proc/1/exe | grep -q "sysvinit" ); then
    cat > /etc/init.d/${input.name} << EOF
#!/bin/bash
### BEGIN INIT INFO
# Provides: ${input.name}
# Required-Start: \\$local_fs \\$network \\$named \\$time \\$syslog
# Required-Stop: \\$local_fs \\$network \\$named \\$time \\$syslog
# Default-Start: 2 3 4 5
# Default-Stop: 0 1 6
# Description: ${input.desc}
### END INIT INFO
## Reference: https://gist.github.com/naholyr/4275302
## Thanks for naholyr for a reference.
. /lib/lsb/init-functions
stop() {
    if [ ! -f /var/run/${input.name}.pid ] || (! kill -0 \\$(cat /var/run/${input.name}.pid 2>/dev/null) 2>/dev/null); then
        log_failure_msg "${input.name} is not running"
        exit 1
    fi
    log_daemon_msg "Stopping ${input.desc}" "${input.name}" || true
    pkill -TERM -P \\$(cat /var/run/${input.name}.pid) 2>/dev/null
    kill -SIGTERM \\$(cat /var/run/${input.name}.pid)
    log_end_msg \\$?
    rm -f /var/run/${input.name}.pid
}
start() {
    if [ -f /var/run/${input.name}.pid ] && (kill -0 \\$(cat /var/run/${input.name}.pid 2>/dev/null) 2>/dev/null); then
        log_failure_msg "${input.name} is already running"
        exit 1
    fi
    log_daemon_msg "Starting ${input.desc}" "${input.name}" || true
    touch /var/log/${input.name}.log
    chown ${input.name} /var/log/${input.name}.log
    sudo -H -u ${input.name} /bin/bash -c "cd /usr/lib/${input.name};${input.run.replace(/"/g,"\\\"").replace(/'/g,"\\\'")} > /var/log/${input.name}.log 2>&1 & echo \\\\\\$!" > /var/run/${input.name}.pid
    log_end_msg $?
}
status() {
    if [ ! -f /var/run/${input.name}.pid ] || (! kill -0 \\$(cat /var/run/${input.name}.pid 2>/dev/null) 2>/dev/null); then
        NOT=" not"
    fi
    log_action_msg "${input.name} is\\$NOT running"
}
case "\\$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        stop
        start
        ;;
    status)
        status
        ;;
    *)
        log_action_msg "Usage: /etc/init.d/${input.name} {start|stop|restart|status}"
esac
EOF
    chmod 755 /etc/init.d/${input.name}
    update-rc.d ${input.name} defaults
    /etc/init.d/${input.name} start
else
    echo "Sorry, but this package dosen't support $(realpath /proc/1/exe) in the moment."
    exit 1
fi
`:''}
`;
}

export function genControlTarGz(input: controlTarGzRaw): Promise<Buffer> {
    return new Promise<Buffer>((res, rej) => {
        let tmparr = [] as Array<Buffer>;
        let pack = tar.pack();

        pack.on('data', (buf) => {
            tmparr.push(buf);
        });
        pack.on('end', () => {
            res(zlib.gzipSync(Buffer.concat(tmparr)));
        })

        pack.entry({name: "control", uid: 0, gid: 0, mode: 0o644}, input.control);
        pack.entry({name: "postinst", uid:0, gid: 0, mode: 0o755}, input.postinst);
        pack.entry({name: "prerm", uid: 0, gid: 0, mode: 0o755}, input.prerm);
        pack.finalize();
    });
}

export function genDataTarGz(path: string): Promise<Buffer> {
    return new Promise<Buffer>((res, rej) => {
        let tmparr = [] as Array<Buffer>;
        let pack = tar.pack();
        pack.on('data', (buf) => {
            tmparr.push(buf);
        });
        pack.on('end', () => {
            res(zlib.gzipSync(Buffer.concat(tmparr)));
        })
        tarfs.pack(`${path}/.fadework`, {
            entries: [ 'usr/' ],
            pack: pack
        });
    })
}

export default async function deb_build(path: string, input: FADeConfiguration) {
    const ctgRaw = {
        control: genControl(input),
        postinst: genPostInst(input),
        prerm: genPreRm(input)
    } as controlTarGzRaw;
    let controlTarGz = await genControlTarGz(ctgRaw);
    let dataTarGz = await genDataTarGz(path);
    if(controlTarGz.length % 2 !== 0)
        controlTarGz = Buffer.concat([controlTarGz, Buffer.alloc(1, 0)]);
    if(dataTarGz.length % 2 !== 0)
        dataTarGz = Buffer.concat([dataTarGz, Buffer.alloc(1, 0)]);
    const controlTarGzHeaderRaw = {
        filename: "control.tar.gz",
        timestamp: Math.floor(Date.now()/1000),
        owner_id: 0,
        group_id: 0,
        filemode: 100644,
        filesize: controlTarGz.length
    } as arHeaderRaw;
    const controlTarGzHeader = genArHeader(controlTarGzHeaderRaw);
    const dataTarGzHeaderRaw = {
        filename: "data.tar.gz",
        timestamp: Math.floor(Date.now()/1000),
        owner_id: 0,
        group_id: 0,
        filemode: 100644,
        filesize: dataTarGz.length
    } as arHeaderRaw;
    const dataTarGzHeader = genArHeader(dataTarGzHeaderRaw);
    return Buffer.concat([arMagicHeader, debianbinaryHeader, debianbinaryData, controlTarGzHeader, controlTarGz, dataTarGzHeader, dataTarGz]);
}