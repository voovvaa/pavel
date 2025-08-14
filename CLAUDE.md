# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Telegram bot with digital personality** (named "Гейсандр Кулович") that uses AI models (OpenAI GPT-5) to create realistic, emotional responses in chat. The bot has long-term memory, emotional intelligence, image analysis capabilities, and sophisticated behavior adaptation.

## Core Commands

### Development
- `bun run dev` - Start development mode with file watching
- `bun start` - Start production mode
- `bun run type-check` - Run TypeScript type checking

### Docker (Production)
- `docker compose up --build` - Build and run containerized version

## Architecture

### Module Structure
- `src/core/` - Core bot functionality and types
  - `bot.ts` - Main DigitalPersonalityBot class
  - `config.ts` - Configuration management with environment variables
  - `types.ts` - All TypeScript type definitions
  - `cache-manager.ts` - Intelligent caching system
  - `health-monitor.ts` - Health checks and monitoring
  - `event-tracker.ts` - Chat event tracking system

- `src/ai/` - AI and machine learning components
  - `ai-engine.ts` - OpenAI GPT integration with cost optimization
  - `response-engine.ts` - Main response generation orchestrator
  - `emotion-analyzer.ts` - 24 emotion types analysis + group dynamics
  - `emotional-adapter.ts` - Emotional response adaptation
  - `image-analyzer.ts` - GPT-4o Vision for image/meme analysis
  - `model-selector.ts` - Interactive AI model selection

- `src/memory/` - Long-term memory system
  - `memory-manager.ts` - SQLite-based persistent memory
  - `memory-viewer.ts` - Memory visualization and debugging tools

- `src/analysis/` - Chat analysis and pattern extraction
  - `analyzer.ts` - Chat data analysis
  - `user-profiler.ts` - Individual user personality profiling
  - `pattern-extractor.ts` - Response pattern extraction from chat history

- `src/utils/` - Utility functions
  - `logger.ts` - Structured logging with levels
  - `init-database.ts` - Database initialization
  - `import-history.js` - Import Telegram chat export data

### Key Technical Details

**Runtime:** Bun 1.x (faster than Node.js, built-in SQLite support)
**Database:** SQLite with tables for messages, user relationships, emotional profiles, and events
**AI Models:** 
- GPT-5 nano (cost-effective, $0.05/$0.40 per 1M tokens)
- GPT-5 chat-latest (high quality, $1.25/$10.00 per 1M tokens) 
- GPT-4o Vision for image analysis

### Environment Configuration
Required environment variables in `.env`:
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `OPENAI_API_KEY` - OpenAI API key
- `AI_MODE` - "ai", "hybrid", or "patterns_only"
- `OPENAI_MODEL` - "gpt-5-nano" or "gpt-5-chat-latest"
- `CHAT_ID` - Target Telegram chat ID

### Testing and Quality
- TypeScript strict mode enabled
- No test framework configured - run `bun run type-check` for type validation
- Health monitoring runs every 30 minutes automatically
- Structured logging with debug/info/warn/error levels

### Database Schema
SQLite database includes tables:
- `messages` - All chat message history
- `user_relationships` - Interpersonal relationships tracking
- `chat_topics` - Active conversation topics
- `emotional_profiles` - Per-user emotional characteristics
- `group_emotional_states` - Group mood dynamics
- `chat_events` - Important chat events and celebrations

### Performance Optimizations
- Smart caching system reduces API calls by 50%
- Promise.race() prevents memory leaks in async operations
- Timeout protection for all AI API calls
- Cost tracking and optimization for OpenAI usage

## Character Implementation

The bot implements "Гейсандр Кулович" - a 35-year-old factory worker with a philosophical, laconic personality. The character has:
- Consistent personality traits and speaking style
- Emotional intelligence with 24 emotion types
- Memory of all chat history and relationships
- Context-aware responses based on chat dynamics
- Image/meme understanding capabilities