import Docker from 'dockerode';

const isWindows = process.platform === 'win32';

// Use standard socket for Linux, or named pipe for Windows if running locally with Docker Desktop
// For the VPS deployment, it should default to /var/run/docker.sock
const socketPath = isWindows ? '//./pipe/docker_engine' : '/var/run/docker.sock';

export const docker = new Docker({ socketPath });

export interface ContainerInfo {
    Id: string;
    Names: string[];
    Image: string;
    State: string;
    Status: string;
    Ports: Docker.Port[];
}
