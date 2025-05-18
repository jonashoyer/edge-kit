# YouTube Integration Services

Edge Kit provides services for integrating with YouTube, allowing you to fetch video information, search for videos, and extract video content.

## Overview

The YouTube integration services allow you to:
- Fetch detailed information about YouTube videos
- Search for videos by keywords
- Extract video content, including transcripts
- Process YouTube URLs and video IDs

## Service Structure

The Edge Kit YouTube integration consists of several components:

1. **YouTubeService**: Main service for interacting with YouTube
2. **YouTubeVideoInfo**: Interface for video information
3. **YouTubeSearchResult**: Interface for search results

## Setup and Usage

### Basic Setup

```typescript
import { YouTubeService } from '../services/youtube/youtube-service';

// Create a YouTube service
const youtubeService = new YouTubeService();

// For operations that might require authentication
const authenticatedYoutubeService = new YouTubeService({
  // Optional: API key for higher rate limits
  apiKey: process.env.YOUTUBE_API_KEY,
});
```

### Fetching Video Information

```typescript
// Fetch basic information about a video
const videoInfo = await youtubeService.getVideoInfo('dQw4w9WgXcQ');

// Output video details
console.log(`Title: ${videoInfo.title}`);
console.log(`Duration: ${videoInfo.duration}`);
console.log(`Uploaded by: ${videoInfo.uploader}`);
console.log(`View count: ${videoInfo.viewCount}`);
console.log(`Like count: ${videoInfo.likeCount}`);
console.log(`Description: ${videoInfo.description}`);
```

### Searching for Videos

```typescript
// Search for videos by keywords
const searchResults = await youtubeService.search('edge kit tutorial', {
  limit: 5, // Limit to 5 results
  sortBy: 'relevance', // Sort by relevance (default)
});

// Process search results
for (const result of searchResults) {
  console.log(`${result.title} (${result.videoId})`);
  console.log(`Uploaded by: ${result.uploader}`);
  console.log(`Duration: ${result.duration}`);
  console.log(`Thumbnail: ${result.thumbnailUrl}`);
  console.log('---');
}
```

### Extracting Video Transcripts

```typescript
// Get transcript for a video
const transcript = await youtubeService.getTranscript('dQw4w9WgXcQ');

// Process transcript
console.log(`Transcript length: ${transcript.length} segments`);

for (const segment of transcript) {
  console.log(`[${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s]: ${segment.text}`);
}

// Get full transcript text
const transcriptText = transcript.map(segment => segment.text).join(' ');
console.log(`Full transcript: ${transcriptText}`);
```

### URL and ID Handling

```typescript
// Extract video ID from various YouTube URL formats
const videoId = youtubeService.extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
console.log(`Video ID: ${videoId}`); // 'dQw4w9WgXcQ'

// Extract video ID from short URLs
const shortUrlId = youtubeService.extractVideoId('https://youtu.be/dQw4w9WgXcQ');
console.log(`Video ID: ${shortUrlId}`); // 'dQw4w9WgXcQ'

// Generate standard YouTube URL from video ID
const fullUrl = youtubeService.getVideoUrl('dQw4w9WgXcQ');
console.log(`Full URL: ${fullUrl}`); // 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
```

## Advanced Usage

### Video Information with Extended Metadata

```typescript
// Get detailed video information with extended metadata
const detailedInfo = await youtubeService.getVideoInfo('dQw4w9WgXcQ', {
  includeExtendedMetadata: true,
});

// Access extended metadata
console.log(`Tags: ${detailedInfo.tags?.join(', ')}`);
console.log(`Category: ${detailedInfo.category}`);
console.log(`Is age restricted: ${detailedInfo.isAgeRestricted}`);
console.log(`Language: ${detailedInfo.language}`);
console.log(`Is licensed content: ${detailedInfo.isLicensedContent}`);
```

### Search with Advanced Options

```typescript
// Search with advanced options
const advancedSearch = await youtubeService.search('programming tutorials', {
  limit: 10,
  sortBy: 'view_count', // Sort by view count
  uploadDate: 'month', // Videos uploaded in the last month
  duration: 'medium', // Medium length videos (4-20 minutes)
  channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw', // Specific channel
});

// Filter for playlists
const playlistSearch = await youtubeService.searchPlaylists('javascript tutorials', {
  limit: 5,
});

for (const playlist of playlistSearch) {
  console.log(`Playlist: ${playlist.title}`);
  console.log(`Creator: ${playlist.uploader}`);
  console.log(`Video count: ${playlist.videoCount}`);
}
```

### Processing Multiple Videos

```typescript
// Process multiple videos in parallel
async function processVideoBatch(videoIds: string[]) {
  const results = await Promise.all(
    videoIds.map(async (videoId) => {
      try {
        const info = await youtubeService.getVideoInfo(videoId);
        return {
          videoId,
          title: info.title,
          success: true,
          data: info,
        };
      } catch (error) {
        return {
          videoId,
          success: false,
          error: error.message,
        };
      }
    })
  );
  
  return results;
}

// Usage
const videoIds = [
  'dQw4w9WgXcQ',
  'jNQXAC9IVRw',
  '9bZkp7q19f0',
];

const processedVideos = await processVideoBatch(videoIds);
console.log(`Processed ${processedVideos.length} videos`);
console.log(`Success: ${processedVideos.filter(v => v.success).length}`);
console.log(`Failed: ${processedVideos.filter(v => !v.success).length}`);
```

## Integration Examples

### Building a Video Library

```typescript
import { YouTubeService } from '../services/youtube/youtube-service';
import { S3Storage } from '../services/storage/s3-storage';
import { UpstashRedisKeyValueService } from '../services/key-value/upstash-redis-key-value';

// Create services
const youtubeService = new YouTubeService();
const storage = new S3Storage({
  bucket: process.env.S3_BUCKET!,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  region: process.env.AWS_REGION!,
});
const kv = new UpstashRedisKeyValueService(
  process.env.UPSTASH_REDIS_URL!,
  process.env.UPSTASH_REDIS_TOKEN!
);

// Store video information
async function addVideoToLibrary(videoId: string, playlistId?: string) {
  // Get video info
  const videoInfo = await youtubeService.getVideoInfo(videoId);
  
  // Get transcript
  let transcript = [];
  try {
    transcript = await youtubeService.getTranscript(videoId);
  } catch (error) {
    console.warn(`No transcript available for ${videoId}`);
  }
  
  // Store in S3
  const videoData = {
    ...videoInfo,
    transcript,
    playlistId,
    addedAt: new Date().toISOString(),
  };
  
  await storage.upload(
    `videos/${videoId}.json`,
    Buffer.from(JSON.stringify(videoData, null, 2))
  );
  
  // Add to index in KV store
  await kv.set(`video:${videoId}`, {
    title: videoInfo.title,
    uploader: videoInfo.uploader,
    duration: videoInfo.duration,
    thumbnailUrl: videoInfo.thumbnailUrl,
    addedAt: new Date().toISOString(),
    playlistId,
  });
  
  if (playlistId) {
    // Add to playlist index
    const playlistVideos = await kv.get<string[]>(`playlist:${playlistId}:videos`) || [];
    if (!playlistVideos.includes(videoId)) {
      playlistVideos.push(videoId);
      await kv.set(`playlist:${playlistId}:videos`, playlistVideos);
    }
  }
  
  return videoData;
}

// Add a whole playlist
async function addPlaylistToLibrary(playlistId: string) {
  // Get playlist info
  const playlistInfo = await youtubeService.getPlaylistInfo(playlistId);
  
  // Store playlist info
  await kv.set(`playlist:${playlistId}`, {
    title: playlistInfo.title,
    uploader: playlistInfo.uploader,
    videoCount: playlistInfo.videoCount,
    addedAt: new Date().toISOString(),
  });
  
  // Add each video
  const results = {
    success: 0,
    failed: 0,
    videos: [],
  };
  
  for (const video of playlistInfo.videos) {
    try {
      const videoData = await addVideoToLibrary(video.videoId, playlistId);
      results.success++;
      results.videos.push({
        videoId: video.videoId,
        title: video.title,
        success: true,
      });
    } catch (error) {
      results.failed++;
      results.videos.push({
        videoId: video.videoId,
        title: video.title,
        success: false,
        error: error.message,
      });
    }
  }
  
  return results;
}
```

### Creating a Video Search Engine

```typescript
import { YouTubeService } from '../services/youtube/youtube-service';
import { UpstashVectorDatabase } from '../services/vector/upstash-vector-database';

// Create services
const youtubeService = new YouTubeService();
const vectorDb = new UpstashVectorDatabase<{
  videoId: string;
  title: string;
  uploader: string;
  segment: string;
  start: number;
  end: number;
}>({
  url: process.env.UPSTASH_VECTOR_URL!,
  token: process.env.UPSTASH_VECTOR_TOKEN!,
});

// Function to get embeddings (implementation depends on your model)
async function getEmbedding(text: string): Promise<number[]> {
  // Example implementation using an embedding API
  const response = await fetch('https://api.example.com/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  
  const data = await response.json();
  return data.embedding;
}

// Index a video's transcript
async function indexVideoTranscript(videoId: string) {
  // Get video info
  const videoInfo = await youtubeService.getVideoInfo(videoId);
  
  // Get transcript
  const transcript = await youtubeService.getTranscript(videoId);
  
  // Index each segment
  const results = [];
  
  for (const segment of transcript) {
    // Get embedding for this segment
    const embedding = await getEmbedding(segment.text);
    
    // Store in vector database
    await vectorDb.upsert('video-segments', [{
      id: `${videoId}-${segment.start}`,
      vector: embedding,
      metadata: {
        videoId,
        title: videoInfo.title,
        uploader: videoInfo.uploader,
        segment: segment.text,
        start: segment.start,
        end: segment.end,
      },
    }]);
    
    results.push({
      start: segment.start,
      end: segment.end,
      text: segment.text,
    });
  }
  
  return {
    videoId,
    title: videoInfo.title,
    segmentsIndexed: results.length,
  };
}

// Search for video segments
async function searchVideoSegments(query: string, limit: number = 5) {
  // Get embedding for query
  const queryEmbedding = await getEmbedding(query);
  
  // Search vector database
  const results = await vectorDb.query(
    'video-segments',
    queryEmbedding,
    limit,
    { includeMetadata: true }
  );
  
  // Format results
  return results.map(result => ({
    videoId: result.metadata!.videoId,
    title: result.metadata!.title,
    uploader: result.metadata!.uploader,
    segment: result.metadata!.segment,
    start: result.metadata!.start,
    end: result.metadata!.end,
    videoUrl: youtubeService.getVideoUrlWithTimestamp(
      result.metadata!.videoId,
      result.metadata!.start
    ),
  }));
}
```

## Best Practices

### 1. Error Handling

```typescript
try {
  const videoInfo = await youtubeService.getVideoInfo('dQw4w9WgXcQ');
  // Process video info...
} catch (error) {
  if (error.message.includes('Video unavailable')) {
    console.error('Video is unavailable or private');
  } else if (error.message.includes('rate limit')) {
    console.error('YouTube API rate limit reached');
    // Implement backoff strategy
  } else {
    console.error('Failed to get video info:', error);
  }
}
```

### 2. Caching Results

```typescript
import { UpstashRedisKeyValueService } from '../services/key-value/upstash-redis-key-value';

// Create services
const youtubeService = new YouTubeService();
const kv = new UpstashRedisKeyValueService(
  process.env.UPSTASH_REDIS_URL!,
  process.env.UPSTASH_REDIS_TOKEN!
);

// Cached video info getter
async function getCachedVideoInfo(videoId: string) {
  const cacheKey = `youtube:video:${videoId}`;
  
  // Try to get from cache
  const cached = await kv.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Fetch from YouTube
  const videoInfo = await youtubeService.getVideoInfo(videoId);
  
  // Cache for 24 hours
  await kv.set(cacheKey, videoInfo, 24 * 60 * 60);
  
  return videoInfo;
}
```

### 3. Rate Limiting

```typescript
import { UpstashRedisKeyValueService } from '../services/key-value/upstash-redis-key-value';

// Create services
const youtubeService = new YouTubeService();
const kv = new UpstashRedisKeyValueService(
  process.env.UPSTASH_REDIS_URL!,
  process.env.UPSTASH_REDIS_TOKEN!
);

// Rate-limited YouTube client
async function rateLimitedVideoInfo(videoId: string) {
  const rateLimitKey = 'youtube:ratelimit:counter';
  const rateLimitTs = 'youtube:ratelimit:ts';
  
  // Check when we last reset the counter
  const lastReset = await kv.get<number>(rateLimitTs) || 0;
  const now = Date.now();
  
  // Reset counter every hour
  if (now - lastReset > 60 * 60 * 1000) {
    await kv.set(rateLimitKey, 0);
    await kv.set(rateLimitTs, now);
  }
  
  // Check current count
  const count = await kv.increment(rateLimitKey);
  
  // If over limit, either wait or throw
  const hourlyLimit = 100; // Adjust based on your needs
  if (count > hourlyLimit) {
    throw new Error('YouTube API rate limit reached. Try again later.');
  }
  
  // Proceed with the request
  return youtubeService.getVideoInfo(videoId);
}
```

### 4. Handling Long Transcripts

```typescript
// Process long transcripts in chunks
async function processLongTranscript(videoId: string, chunkSize: number = 10) {
  const transcript = await youtubeService.getTranscript(videoId);
  const chunks = [];
  
  // Split into chunks
  for (let i = 0; i < transcript.length; i += chunkSize) {
    const chunk = transcript.slice(i, i + chunkSize);
    
    // Process each chunk
    const combinedText = chunk.map(segment => segment.text).join(' ');
    
    chunks.push({
      startTime: chunk[0].start,
      endTime: chunk[chunk.length - 1].end,
      text: combinedText,
    });
  }
  
  return chunks;
}
```

### 5. Extracting Structured Information

```typescript
// Extract topics or keywords from transcript
async function extractTopicsFromVideo(videoId: string) {
  // Get transcript
  const transcript = await youtubeService.getTranscript(videoId);
  const fullText = transcript.map(segment => segment.text).join(' ');
  
  // Use NLP or AI service to extract topics
  // This is a placeholder for your specific implementation
  const topics = await extractTopicsFromText(fullText);
  
  return {
    videoId,
    topics,
  };
}

// Create timestamped table of contents
async function createTableOfContents(videoId: string) {
  // Get video transcript
  const transcript = await youtubeService.getTranscript(videoId);
  const fullText = transcript.map(segment => segment.text).join(' ');
  
  // Process transcript to find section breaks
  // This is a placeholder for your implementation
  const sections = await detectSections(transcript);
  
  return sections.map(section => ({
    title: section.title,
    startTime: section.startTime,
    url: youtubeService.getVideoUrlWithTimestamp(videoId, section.startTime),
  }));
}
```

## Implementation Details

The YouTube integration uses `youtubei.js` internally, which provides a robust way to interact with YouTube's internal API. This provides several advantages:

1. No API key required for basic operations
2. Access to data not available through the official API
3. Ability to fetch transcripts without authentication
4. More detailed video metadata

However, there are some limitations to be aware of:

1. Potential rate limiting if making many requests
2. Possibility of API changes by YouTube
3. Limited to publicly available data

For heavy production usage, consider implementing a caching strategy and possibly using the official YouTube API as a fallback.

## Extending the YouTube Integration

### Custom Video Pre-processor

```typescript
import { YouTubeService } from '../services/youtube/youtube-service';

// Extend the base YouTubeService
class EnhancedYouTubeService extends YouTubeService {
  constructor(options?: { apiKey?: string }) {
    super(options);
  }
  
  // Add custom methods
  async getVideoWithSummary(videoId: string) {
    // Get standard video info
    const videoInfo = await this.getVideoInfo(videoId);
    
    // Get transcript
    const transcript = await this.getTranscript(videoId);
    const transcriptText = transcript.map(segment => segment.text).join(' ');
    
    // Generate summary (using an external API or service)
    const summary = await this.generateSummary(transcriptText);
    
    // Return enhanced info
    return {
      ...videoInfo,
      transcript,
      summary,
    };
  }
  
  private async generateSummary(text: string) {
    // Implement your summarization logic
    // This could use an LLM API, custom NLP, etc.
    return "This is a placeholder summary";
  }
  
  // Override methods if needed
  async getVideoInfo(videoId: string, options?: any) {
    const info = await super.getVideoInfo(videoId, options);
    
    // Add custom processing
    return {
      ...info,
      enhancedAt: new Date().toISOString(),
    };
  }
}
```

### Transcript Analysis Utilities

```typescript
import { YouTubeService, TranscriptSegment } from '../services/youtube/youtube-service';

// Create utility class for transcript analysis
class TranscriptAnalyzer {
  constructor(private youtubeService: YouTubeService) {}
  
  // Find key moments in a video
  async findKeyMoments(videoId: string) {
    const transcript = await this.youtubeService.getTranscript(videoId);
    const keyMoments = [];
    
    // Simple keyword-based detection
    const keyPhrases = [
      'important', 'key point', 'remember', 'crucial',
      'in conclusion', 'to summarize', 'first', 'second',
      'finally', 'most importantly',
    ];
    
    for (const segment of transcript) {
      for (const phrase of keyPhrases) {
        if (segment.text.toLowerCase().includes(phrase)) {
          keyMoments.push({
            time: segment.start,
            phrase,
            text: segment.text,
            url: this.youtubeService.getVideoUrlWithTimestamp(videoId, segment.start),
          });
          break;
        }
      }
    }
    
    return keyMoments;
  }
  
  // Extract questions and answers
  async extractQA(videoId: string) {
    const transcript = await this.youtubeService.getTranscript(videoId);
    const qa = [];
    
    for (let i = 0; i < transcript.length; i++) {
      const segment = transcript[i];
      
      // Check if segment contains a question
      if (segment.text.trim().endsWith('?')) {
        // Look for an answer in the next few segments
        const questionTime = segment.start;
        const question = segment.text;
        
        let answer = '';
        let answerTime = 0;
        
        // Look at the next 3 segments for an answer
        for (let j = i + 1; j < Math.min(i + 4, transcript.length); j++) {
          answer += transcript[j].text + ' ';
          if (j === i + 1) {
            answerTime = transcript[j].start;
          }
        }
        
        qa.push({
          question,
          questionTime,
          questionUrl: this.youtubeService.getVideoUrlWithTimestamp(videoId, questionTime),
          answer: answer.trim(),
          answerTime,
          answerUrl: this.youtubeService.getVideoUrlWithTimestamp(videoId, answerTime),
        });
      }
    }
    
    return qa;
  }
  
  // Generate transcript word cloud data
  async generateWordCloudData(videoId: string) {
    const transcript = await this.youtubeService.getTranscript(videoId);
    const text = transcript.map(segment => segment.text).join(' ');
    
    // Process text to get word frequencies
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3) // Filter out short words
      .filter(word => !this.isStopWord(word)); // Filter out stop words
    
    // Count word frequencies
    const wordCounts = {};
    for (const word of words) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
    
    // Convert to array and sort
    return Object.entries(wordCounts)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 100); // Top 100 words
  }
  
  private isStopWord(word: string): boolean {
    const stopWords = [
      'the', 'and', 'that', 'this', 'with', 'for', 'from',
      'have', 'has', 'had', 'not', 'are', 'were', 'was',
      'what', 'when', 'where', 'who', 'why', 'how',
    ];
    return stopWords.includes(word);
  }
}
```
