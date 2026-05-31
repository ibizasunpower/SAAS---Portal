/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { docker } from '@/lib/docker';

// This API will return the last 100 lines of logs
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id) {
            return NextResponse.json({ error: 'Missing container ID' }, { status: 400 });
        }

        const container = docker.getContainer(id);

        // simple synchronous log fetch for now, not streaming socket
        // Dockerode logs returns a buffer if we don't ask for stream
        const buffer = await container.logs({
            stdout: true,
            stderr: true,
            tail: 100, // Last 100 lines
            timestamps: true
        });

        // Docker multiplexed logs need parsing if using raw stream, but simple fetch might just give text?
        // Actually dockerode logs(opts) usually returns Buffer.
        // If we want just text:

        const logs = buffer.toString('utf8');

        // NOTE: Docker raw logs have headers. For simple use, we return raw string.
        // The frontend might see some garbage characters at start of lines (Tty header).
        // A cleaner way is to demux, but for MVP plain string is ok.

        return NextResponse.json({ logs });

    } catch (error: any) {
        console.error('Failed to get logs:', error);
        return NextResponse.json({ error: 'Failed to get logs' }, { status: 500 });
    }
}
