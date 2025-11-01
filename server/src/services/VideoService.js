const axios = require('axios');
const logger = require('../utils/logger');

class VideoService {
  constructor() {
    this.youtubeApiKey = process.env.YOUTUBE_API_KEY;
    this.cache = new Map();
    this.cacheExpiry = 60 * 60 * 1000; // 1 hour
  }

  // Extract video information from various URLs
  extractVideoInfo(url) {
    // YouTube patterns
    const youtubePatterns = [
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:watch\?.*v=|live\/|shorts\/)([a-zA-Z0-9_-]{11})/
    ];

    // TikTok patterns
    const tiktokPatterns = [
      /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d+)/,
      /(?:https?:\/\/)?vm\.tiktok\.com\/([a-zA-Z0-9]+)/
    ];

    // Instagram patterns
    const instagramPatterns = [
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/reel\/([a-zA-Z0-9_-]+)/,
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/p\/([a-zA-Z0-9_-]+)/
    ];

    // Check YouTube
    for (const pattern of youtubePatterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          platform: 'YOUTUBE',
          videoId: match[1],
          url: url
        };
      }
    }

    // Check TikTok
    for (const pattern of tiktokPatterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          platform: 'TIKTOK',
          videoId: match[1],
          url: url
        };
      }
    }

    // Check Instagram
    for (const pattern of instagramPatterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          platform: 'INSTAGRAM',
          videoId: match[1],
          url: url
        };
      }
    }

    return null;
  }

  // Get video metadata based on platform
  async getVideoMetadata(url, options = {}) {
    try {
      const videoInfo = this.extractVideoInfo(url);
      
      if (!videoInfo) {
        throw new Error('Unsupported video URL format');
      }

      // Check cache first
      const cacheKey = `${videoInfo.platform}:${videoInfo.videoId}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheExpiry) {
          logger.debug(`Cache hit for ${cacheKey}`);
          return cached.data;
        } else {
          this.cache.delete(cacheKey);
        }
      }

      let metadata;
      switch (videoInfo.platform) {
        case 'YOUTUBE':
          metadata = await this.getYouTubeMetadata(videoInfo.videoId, options);
          break;
        case 'TIKTOK':
          metadata = await this.getTikTokMetadata(videoInfo.url);
          break;
        case 'INSTAGRAM':
          metadata = await this.getInstagramMetadata(videoInfo.url);
          break;
        default:
          throw new Error(`Unsupported platform: ${videoInfo.platform}`);
      }

      // Add common fields
      metadata.platform = videoInfo.platform;
      metadata.videoId = videoInfo.videoId;
      metadata.url = videoInfo.url;

      // Cache the result
      this.cache.set(cacheKey, {
        data: metadata,
        timestamp: Date.now()
      });

      logger.info(`Metadata fetched for ${videoInfo.platform} video: ${metadata.title}`);
      return metadata;
    } catch (error) {
      logger.error('Failed to get video metadata:', error);
      throw error;
    }
  }

  // YouTube API integration
  async getYouTubeMetadata(videoId, options = {}) {
    if (!this.youtubeApiKey) {
      throw new Error('YouTube API key not configured');
    }

    try {
      const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: {
          id: videoId,
          part: 'snippet,contentDetails',
          key: this.youtubeApiKey
        },
        timeout: 10000
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error('Video not found or private');
      }

      const video = response.data.items[0];
      const snippet = video.snippet;
      const contentDetails = video.contentDetails;

      // Parse duration from ISO 8601 format (PT1M30S) to seconds
      const duration = this.parseYouTubeDuration(contentDetails.duration);

      // Check duration limit
      const envMaxDuration = Number.parseInt(process.env.MAX_VIDEO_DURATION || '600', 10);
      const requestedMaxDuration = options?.maxDuration ?? envMaxDuration;
      const parsedRequested = Number.parseInt(String(requestedMaxDuration), 10);
      const maxDuration = Number.isFinite(parsedRequested) && parsedRequested > 0
        ? parsedRequested
        : (Number.isFinite(envMaxDuration) && envMaxDuration > 0 ? envMaxDuration : 600);
      if (duration > maxDuration) {
        throw new Error(`Video too long (${Math.floor(duration / 60)}m ${duration % 60}s). Max allowed: ${Math.floor(maxDuration / 60)}m ${maxDuration % 60}s`);
      }

      return {
        title: snippet.title,
        thumbnail: snippet.thumbnails.high?.url || snippet.thumbnails.default?.url,
        duration: duration,
        channelTitle: snippet.channelTitle,
        publishedAt: snippet.publishedAt
      };
    } catch (error) {
      if (error.response?.status === 403) {
        throw new Error('YouTube API quota exceeded or invalid key');
      }
      throw error;
    }
  }

  // TikTok metadata (web scraping fallback)
  async getTikTokMetadata(url) {
    try {
      // For now, return basic metadata
      // In production, you might want to use a proper scraping service
      logger.warn('TikTok metadata fetching not fully implemented - using fallback');
      
      return {
        title: 'TikTok Video',
        thumbnail: null,
        duration: null, // TikTok videos are typically short
        channelTitle: 'TikTok User',
        publishedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get TikTok metadata:', error);
      throw new Error('Failed to fetch TikTok video information');
    }
  }

  // Instagram metadata (web scraping fallback)
  async getInstagramMetadata(url) {
    try {
      // For now, return basic metadata
      // In production, you might want to use a proper scraping service
      logger.warn('Instagram metadata fetching not fully implemented - using fallback');
      
      return {
        title: 'Instagram Reel',
        thumbnail: null,
        duration: null,
        channelTitle: 'Instagram User',
        publishedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get Instagram metadata:', error);
      throw new Error('Failed to fetch Instagram video information');
    }
  }

  // Helper method to parse YouTube duration format
  parseYouTubeDuration(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;

    return hours * 3600 + minutes * 60 + seconds;
  }

  // Validate video URL
  isValidVideoUrl(url) {
    try {
      const videoInfo = this.extractVideoInfo(url);
      return videoInfo !== null;
    } catch (error) {
      return false;
    }
  }

  // Get supported platforms
  getSupportedPlatforms() {
    return ['YOUTUBE', 'TIKTOK', 'INSTAGRAM'];
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
    logger.info('Video metadata cache cleared');
  }

  // Get cache stats
  getCacheStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp < this.cacheExpiry) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      total: this.cache.size,
      valid: validEntries,
      expired: expiredEntries
    };
  }
}

module.exports = VideoService;
