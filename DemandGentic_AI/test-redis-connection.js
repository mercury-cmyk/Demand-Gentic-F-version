import { createClient } from 'redis';

const client = createClient({
    username: 'default',
    password: 'ttVaOhNjFsLxPOheFUkbFgyad1DLlhdt',
    socket: {
        host: 'redis-11546.fcrce171.ap-south-1-1.ec2.redns.redis-cloud.com',
        port: 11546
    }
});

client.on('error', err => console.log('Redis Client Error', err));

(async () => {
    try {
        await client.connect();
        await client.set('foo', 'bar');
        const result = await client.get('foo');
        console.log(result);  // Should print 'bar' if credentials are correct
        await client.disconnect();
    } catch (err) {
        console.error('Connection/Test failed:', err);
    }
})();