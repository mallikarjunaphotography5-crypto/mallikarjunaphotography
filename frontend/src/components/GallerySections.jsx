import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { API, getConnectionStatus, diagnoseBrokenConnections } from '../api';
import LoadingSpinner from './LoadingSpinner';
import ImageOptimizer from './ImageOptimizer';

const FALLBACK_GALLERY_DATA = [
	{ id: 'wedding', title: 'Wedding', images: [] },
	{ id: 'portrait', title: 'Portrait', images: [] },
	{ id: 'family', title: 'Family', images: [] },
];

const isVideo = (url = '') => {
	return (
		url.includes('/video/upload/') ||
		url.endsWith('.mp4') ||
		url.endsWith('.mov') ||
		url.endsWith('.webm')
	);
};

const MediaPreview = ({ media, title, priority }) => {
	if (isVideo(media?.url)) {
		return (
			<video
				src={media.url}
				muted
				loop
				playsInline
				preload="metadata"
				className="w-full h-64 object-contain bg-gray-100"
			/>
		);
	}

	return (
		<ImageOptimizer
			src={media.url}
			alt={`Preview of ${title} gallery`}
			className="w-full h-64 object-contain bg-gray-100"
			priority={priority}
		/>
	);
};

const GallerySections = () => {
	const [galleryData, setGalleryData] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [retryCount, setRetryCount] = useState(0);
	const [usingFallbackData, setUsingFallbackData] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState(
		getConnectionStatus(),
	);
	const [diagnosticResults, setDiagnosticResults] = useState(null);
	const [runningDiagnostics, setRunningDiagnostics] = useState(false);

	const MAX_RETRIES = 3;

	const runDiagnostics = async () => {
		setRunningDiagnostics(true);

		try {
			const results = await diagnoseBrokenConnections();
			setDiagnosticResults(results);
		} catch (error) {
			console.error('Error running diagnostics:', error);
		} finally {
			setRunningDiagnostics(false);
		}
	};

	useEffect(() => {
		const checkConnectionInterval = setInterval(() => {
			setConnectionStatus(getConnectionStatus());
		}, 5000);

		return () => clearInterval(checkConnectionInterval);
	}, []);

	useEffect(() => {
		const fetchGalleryData = async () => {
			try {
				setLoading(true);
				setError(null);

				const response = await API.get('/images');
				const data = response.data;

				if (!Array.isArray(data)) {
					throw new Error('Invalid data format received from API');
				}

				const groupedData = data.reduce((acc, image) => {
					if (!image.category) return acc;

					const category = image.category.toLowerCase();

					if (!acc[category]) acc[category] = [];

					acc[category].push(image);
					return acc;
				}, {});

				const formattedData = Object.keys(groupedData)
					.map((category) => ({
						id: category,
						title:
							category.charAt(0).toUpperCase() +
							category.slice(1),
						images: groupedData[category].sort(
							(a, b) => (a.order || 0) - (b.order || 0),
						),
					}))
					.sort((a, b) => a.title.localeCompare(b.title));

				setGalleryData(formattedData);
				setUsingFallbackData(false);
			} catch (error) {
				console.error('Error fetching gallery data:', error);

				const is502Error = error.response?.status === 502;
				const isNetworkError =
					!error.response &&
					(error.code === 'ECONNABORTED' ||
						error.code === 'ECONNREFUSED' ||
						error.message.includes('Network Error'));

				setError(error.message || 'Failed to load gallery sections');

				if ((is502Error || isNetworkError) && retryCount >= 1) {
					setGalleryData(FALLBACK_GALLERY_DATA);
					setUsingFallbackData(true);
					return;
				}

				const { isOfflineMode } = getConnectionStatus();

				if (isOfflineMode) {
					setGalleryData(FALLBACK_GALLERY_DATA);
					setUsingFallbackData(true);
					return;
				}

				if (retryCount < MAX_RETRIES) {
					setRetryCount((prev) => prev + 1);
					return;
				}

				setGalleryData(FALLBACK_GALLERY_DATA);
				setUsingFallbackData(true);
			} finally {
				setLoading(false);
			}
		};

		const retryDelay = retryCount > 0 ? 2000 * retryCount : 0;
		const timer = setTimeout(fetchGalleryData, retryDelay);

		return () => clearTimeout(timer);
	}, [retryCount]);

	const renderDiagnosticResults = () => {
		if (!diagnosticResults) return null;

		return (
			<div className="mt-4 p-4 bg-gray-100 rounded-lg text-sm">
				<h3 className="font-bold mb-2">Service Diagnostics:</h3>

				<ul className="list-disc pl-5 mb-3">
					{Object.entries(diagnosticResults.results || {}).map(
						([service, info]) => (
							<li
								key={service}
								className={
									info.status === 'reachable'
										? 'text-green-600'
										: 'text-red-600'
								}
							>
								{service}: {info.status}
								{info.latency ? ` (${info.latency}ms)` : ''}
								{info.error ? ` - Error: ${info.error}` : ''}
							</li>
						),
					)}
				</ul>

				{diagnosticResults.recommendations?.length > 0 && (
					<>
						<h3 className="font-bold mb-2">Recommendations:</h3>
						<ul className="list-disc pl-5">
							{diagnosticResults.recommendations.map((rec, i) => (
								<li key={i}>{rec}</li>
							))}
						</ul>
					</>
				)}

				<p className="text-xs mt-3 text-gray-500">
					Timestamp:{' '}
					{new Date(diagnosticResults.timestamp).toLocaleString()}
				</p>
			</div>
		);
	};

	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<LoadingSpinner />
			</div>
		);
	}

	if (error && !usingFallbackData) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="text-center">
					<h2 className="text-2xl font-bold text-red-600 mb-4">
						{error}
					</h2>

					<div className="flex flex-col space-y-3">
						<button
							onClick={() => {
								setRetryCount(0);
								setLoading(true);
							}}
							className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
						>
							Try Again
						</button>

						<button
							onClick={runDiagnostics}
							disabled={runningDiagnostics}
							className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
						>
							{runningDiagnostics
								? 'Running Diagnostics...'
								: 'Run Diagnostics'}
						</button>
					</div>

					{renderDiagnosticResults()}
				</div>
			</div>
		);
	}

	return (
		<div id="gallery" className="py-12 bg-gray-100">
			<div className="max-w-7xl mx-auto px-4">
				<h1 className="text-5xl font-heading text-center mb-12">
					Explore My Latest Works
				</h1>

				{(usingFallbackData || connectionStatus.isConnectionIssue) && (
					<div className="text-center text-amber-600 mb-8 p-4 bg-amber-100 rounded-lg">
						<p>
							Currently showing{' '}
							{usingFallbackData
								? 'limited (fallback)'
								: 'limited'}{' '}
							gallery content due to server connection issues.
						</p>

						<div className="mt-3">
							<button
								onClick={runDiagnostics}
								disabled={runningDiagnostics}
								className="px-3 py-1 bg-amber-700 text-white text-sm rounded hover:bg-amber-800 disabled:opacity-50"
							>
								{runningDiagnostics
									? 'Running Diagnostics...'
									: 'Diagnose Connection Issues'}
							</button>
						</div>

						{renderDiagnosticResults()}
					</div>
				)}

				{galleryData.length === 0 ? (
					<div className="text-center text-gray-600">
						<p>No gallery sections available at the moment.</p>
					</div>
				) : (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
						{galleryData.map((section, index) => (
							<Link
								to={`/gallery/${section.id}`}
								key={section.id}
								className="relative block group rounded-lg overflow-hidden shadow-lg transform transition-transform hover:scale-105"
							>
								{section.images && section.images.length > 0 ? (
									<div className="relative">
										<MediaPreview
											media={section.images[0]}
											title={section.title}
											priority={index < 3}
										/>

										{isVideo(section.images[0]?.url) && (
											<div className="absolute inset-0 flex items-center justify-center">
												<div className="bg-black bg-opacity-60 text-white rounded-full w-14 h-14 flex items-center justify-center text-2xl">
													▶
												</div>
											</div>
										)}

										<div className="absolute inset-0 bg-black bg-opacity-30 transition-opacity group-hover:bg-opacity-40" />
									</div>
								) : (
									<div className="w-full h-64 bg-gray-300 flex items-center justify-center">
										<p>No media available</p>
									</div>
								)}

								<div className="absolute inset-0 flex items-center justify-center">
									<h2 className="dancing-script-gallery-title text-4xl md:text-6xl text-white text-center drop-shadow-lg">
										{section.title}
									</h2>
								</div>
							</Link>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default GallerySections;
