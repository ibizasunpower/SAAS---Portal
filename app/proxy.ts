import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
    const basicAuth = request.headers.get('authorization');

    if (basicAuth) {
        const authValue = basicAuth.split(' ')[1];
        const [user, pwd] = atob(authValue).split(':');

        // Check against environment variables
        if (user === process.env.ADMIN_USERNAME && pwd === process.env.ADMIN_PASSWORD) {
            return NextResponse.next();
        }
    }

    // Authentication failed or not provided
    return new NextResponse('Authentication required', {
        status: 401,
        headers: {
            'WWW-Authenticate': 'Basic realm="SAAS Portal - Admin Access"',
        },
    });
}

// Protect all routes
export const config = {
    matcher: '/:path*',
};
