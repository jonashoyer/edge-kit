import { z } from "zod";

import { CustomError } from "../../utils/custom-error";
import {
	FetchExtHttpError,
	FetchExtSchemaValidationError,
	fetchExt,
} from "../../utils/fetch-utils";

export type PexelsMediaType = "image" | "video";

export interface PexelsQueryOptions {
	perPage?: number;
	page?: number;
	orientation?: "portrait" | "landscape" | "square";
}

export interface PexelsQueryAlternativesService {
	getAlternativeQueries(input: {
		query: string;
		type: PexelsMediaType;
	}): Promise<string[]>;
}

export interface PexelsSearchOptions extends PexelsQueryOptions {
	useAiAlternatives?: boolean;
	maxAlternatives?: number;
}

export interface PexelsImageItem {
	id: string;
	type: "image";
	src: string | null;
	previewUrl: string | null;
	name: string | null;
}

export interface PexelsVideoItem {
	id: string;
	type: "video";
	src: string | null;
	previewUrl: string | null;
	name: string | null;
	duration?: number;
	tags?: string[];
}

export type PexelsMediaItem = PexelsImageItem | PexelsVideoItem;

export interface PexelsMediaServiceOptions {
	pexelsApiKey: string;
}

export type PexelsMediaErrorCode =
	| "PEXELS_API_ERROR"
	| "PEXELS_INVALID_RESPONSE";

export class PexelsMediaError extends CustomError<PexelsMediaErrorCode> {
	readonly cause?: unknown;

	constructor(message: string, code: PexelsMediaErrorCode, cause?: unknown) {
		super(message, code);
		this.cause = cause;
	}
}

const pexelsVideoFileSchema = z
	.object({
		quality: z.string(),
		link: z.string(),
	})
	.loose();

const pexelsVideoSchema = z
	.object({
		id: z.number(),
		url: z.string(),
		image: z.string().nullable().optional(),
		duration: z.number().optional(),
		tags: z.array(z.string()).optional(),
		video_files: z.array(pexelsVideoFileSchema).default([]),
	})
	.loose();

const pexelsPhotoSchema = z
	.object({
		id: z.number(),
		url: z.string(),
		alt: z.string().nullable().optional(),
		src: z
			.object({
				original: z.string(),
			})
			.loose(),
	})
	.loose();

const pexelsVideoResponseSchema = z
	.object({
		videos: z.array(pexelsVideoSchema),
	})
	.loose();

const pexelsPhotoResponseSchema = z
	.object({
		photos: z.array(pexelsPhotoSchema),
	})
	.loose();

type PexelsVideo = z.infer<typeof pexelsVideoSchema>;
type PexelsPhoto = z.infer<typeof pexelsPhotoSchema>;

export class PexelsMediaService {
	private apiKey: string;

	constructor(options: PexelsMediaServiceOptions) {
		this.apiKey = options.pexelsApiKey;
	}

	async fetchMedia(
		type: PexelsMediaType,
		queries: string[],
		options: PexelsSearchOptions,
	): Promise<PexelsMediaItem[]> {
		const itemsById = new Map<string, PexelsMediaItem>();

		for (const q of queries) {
			const batch = await this.fetchPexels(type, q, options);
			for (const item of batch) {
				if (!itemsById.has(item.id)) {
					itemsById.set(item.id, item);
				}
			}
		}

		return Array.from(itemsById.values());
	}

	private async fetchPexels(
		type: PexelsMediaType,
		query: string,
		options: PexelsQueryOptions,
	): Promise<PexelsMediaItem[]> {
		const baseUrl =
			type === "video"
				? "https://api.pexels.com/videos/search"
				: "https://api.pexels.com/v1/search";

		const url = `${baseUrl}?${this.pexelsQueryToUrlParams(query, options)}`;
		const request = {
			url,
			init: {
				headers: {
					Authorization: this.apiKey,
				},
			},
			throwOnHttpError: true,
		};

		try {
			if (type === "video") {
				const { data } = await fetchExt({
					...request,
					expectJson: { schema: pexelsVideoResponseSchema },
				});
				return data.videos.map((item) => this.parsePexelsItem(item, type));
			}

			const { data } = await fetchExt({
				...request,
				expectJson: { schema: pexelsPhotoResponseSchema },
			});
			return data.photos.map((item) => this.parsePexelsItem(item, type));
		} catch (error) {
			throw this.toPexelsError(error, type);
		}
	}

	private pexelsQueryToUrlParams(query: string, options: PexelsQueryOptions) {
		return `query=${encodeURIComponent(query)}&per_page=${options.perPage ?? 5}&page=${options.page ?? 1}&orientation=${options.orientation ?? "portrait"}`;
	}

	private parsePexelsItem(
		item: PexelsVideo | PexelsPhoto,
		type: PexelsMediaType,
	): PexelsMediaItem {
		const isVideo = type === "video";
		const video = item as PexelsVideo;
		const photo = item as PexelsPhoto;

		return {
			id: String(item.id),
			type,
			src:
				(isVideo
					? this.findBestFitVideoQuality(video.video_files)?.link
					: photo.src.original) ?? null,
			...(isVideo && {
				duration: video.duration,
				tags: video.tags,
			}),
			previewUrl: this.imageToCroppedUrl(
				isVideo ? video.image : photo.src.original,
			),
			name:
				isVideo
					? this.getVideoName(item.url)
					: (photo.alt ?? this.getVideoName(item.url)),
		};
	}

	private findBestFitVideoQuality(
		videoClips: { quality: string; link: string }[],
	) {
		return ["hd", "uhd", "sd"].reduce(
			(curr, quality) => {
				if (curr?.link) return curr;
				const video = videoClips.find((video) => video.quality === quality);
				return video ?? null;
			},
			null as { quality: string; link: string } | null,
		);
	}

	private getVideoName(videoUrl: string) {
		return (
			videoUrl
				.trim()
				.replace(/\s?\d+?\/?$/, "")
				.replace(/^.*\//, "")
				.replace(/-/g, " ")
				.replace(/\b\w/g, (char) => char.toUpperCase()) ?? null
		);
	}

	private imageToCroppedUrl(imageUrl: string | null | undefined) {
		if (!imageUrl) return null;
		const str = imageUrl.split("?")[0];
		if (!str) return null;
		return `${str}?auto=compress&cs=tinysrgb&fit=crop&h=521`;
	}

	private toPexelsError(
		error: unknown,
		type: PexelsMediaType,
	): PexelsMediaError {
		if (error instanceof PexelsMediaError) return error;
		if (error instanceof FetchExtHttpError) {
			return new PexelsMediaError(
				`Pexels API error ${error.status}: ${error.statusText}`,
				"PEXELS_API_ERROR",
				error,
			);
		}
		if (error instanceof FetchExtSchemaValidationError) {
			return new PexelsMediaError(
				`Invalid Pexels ${type} response shape`,
				"PEXELS_INVALID_RESPONSE",
				error,
			);
		}
		if (error instanceof Error) {
			return new PexelsMediaError(
				`Pexels API error: ${error.message}`,
				"PEXELS_API_ERROR",
				error,
			);
		}
		return new PexelsMediaError("Pexels API error", "PEXELS_API_ERROR", error);
	}
}
