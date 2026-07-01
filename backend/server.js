import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import compression from 'compression';
import connectDB from './config/db.js';
import mongoose from 'mongoose';
import cors from 'cors';

import imageRoutes from './routes/imageRoutes.js';
import userRoutes from './routes/userRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import pricingRoutes from './routes/pricingRoutes.js';

import imageOptimization from './middleware/imageOptimization.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

const allowedOrigins = [
	'http://localhost:3000',
	'https://mallikarjunaphotography.vercel.app',
	'https://mallikarjunaphotography.webpoise.in',
];

app.use(
	cors({
		origin: function (origin, callback) {
			if (!origin || allowedOrigins.includes(origin)) {
				callback(null, true);
			} else {
				callback(new Error('Not allowed by CORS'));
			}
		},
		credentials: true,
	}),
);

app.options('*', cors());

await connectDB();

app.use(
	compression({
		level: 6,
		threshold: 1000,
		filter: (req, res) => {
			if (req.headers['x-no-compression']) return false;
			return compression.filter(req, res);
		},
	}),
);

app.use(express.json({ limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.use((req, res, next) => {
	if (req.url.match(/\.(css|js|jpg|jpeg|png|gif|ico|woff2|svg)$/)) {
		res.setHeader('Cache-Control', 'public, max-age=2592000');
		res.setHeader(
			'Expires',
			new Date(Date.now() + 2592000000).toUTCString(),
		);
	}
	next();
});

app.use('/.well-known/acme-challenge', (req, res) => {
	res.status(404).send('Not found');
});

app.use('/images', imageRoutes);
app.use('/users', userRoutes);
app.use('/bookings', bookingRoutes);
app.use('/reviews', reviewRoutes);
app.use('/pricing', pricingRoutes);

app.get('/image-optimize', imageOptimization.optimizeImage);

app.get('/', (req, res) => {
	res.json({ message: 'Mallikarjuna Photography API is running' });
});

app.get('/debug', (req, res) => {
	res.json({
		message: 'Debug endpoint working',
		time: new Date().toISOString(),
		mongodb:
			mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
		environment: process.env.NODE_ENV,
		headers: req.headers,
		remoteAddress: req.ip,
		hostname: req.hostname,
	});
});

app.use('/assets', express.static(path.join(__dirname, '/assets')));

mongoose.connection.on('disconnected', () => {
	console.log('MongoDB disconnected! Attempting to reconnect...');
	setTimeout(connectDB, 5000);
});

mongoose.connection.on('error', (err) => {
	console.error('MongoDB connection error:', err);
	setTimeout(connectDB, 5000);
});

app.use((err, req, res, next) => {
	console.error('Server Error:', {
		message: err.message,
		stack: err.stack,
		mongoState: mongoose.connection.readyState,
	});
	res.status(500).json({
		message: 'Internal Server Error',
		error: process.env.NODE_ENV === 'development' ? err.message : undefined,
	});
});

const PORT = process.env.PORT || 8000;
const server = http.createServer(app);

server.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});

process.on('unhandledRejection', (err) => {
	console.error('Unhandled Rejection:', err);
	console.error('Process will continue running...');
});

process.on('uncaughtException', (err) => {
	console.error('Uncaught Exception:', err);
	console.error('Process will continue running...');
});
