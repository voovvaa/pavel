# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a sophisticated Telegram chatbot named "Гейсандр Кулович" (Geisandr Kulovich) that combines personality-based pattern matching with AI-powered responses and persistent memory. The bot is built with TypeScript, runs on Bun runtime, and integrates with OpenAI's GPT-5 models.

### Core Components

**AI Integration & Response Engine:**
- `src/ai-engine.ts` - AI response generation with model-specific configurations for GPT-5 nano and GPT-5 chat-latest
- `src/response-engine.ts` - Central response logic that decides between AI responses and pattern matching
- `src/model-selector.ts` - Interactive model selection utility

**Memory System:**
- `src/memory-manager.ts` - SQLite-based persistent memory for chat history, user relationships, and topics
- `src/memory-viewer.ts` - Memory inspection and statistics utility
- `memory.db` - SQLite database storing messages, user relationships, chat topics, and conversation summaries

**Pattern-Based Responses:**
- `chat/result_personality.json` - Extracted personality patterns and responses from chat analysis
- `src/pattern-extractor.ts` - Utility to extract conversation patterns from chat exports

**Chat Analysis Pipeline:**
- `src/parser.ts` - Parse Telegram chat exports (JSON format)
- `src/analytics.ts` - Statistical analysis of chat data
- `src/analyzer.ts` - Higher-level chat behavior analysis
- `src/visualizer.ts` - Generate analysis reports and statistics

### Key Architecture Patterns

**Hybrid AI/Pattern System:**
- AI mode configurable via `AI_MODE` environment variable (patterns_only, ai_only, hybrid)
- AI responses for complex queries, patterns for quick reactions
- Memory context passed to AI for contextual responses

**Memory-Driven Context:**
- All messages stored with metadata (importance, emotion, topics, mentions)
- User relationships tracked (interaction count, common topics, relationship type)
- Active topics maintained with mention frequency and importance scores
- Memory context built dynamically for each AI response

**Personality Simulation:**
- Character prompt engineered to sound natural and avoid "trying too hard"
- Different prompt strategies for nano vs full GPT-5 models
- Pattern matching for immediate responses to specific keywords

**Stage 9: Smart Behavior System (COMPLETED):**
- Dynamic activity scheduling based on real chat patterns (`src/core/activity-manager.ts`)
- Event tracking and long-term memory for natural conversation references (`src/core/event-tracker.ts`)
- Contextual behavior optimization that adapts response style to situational context
- Smart probability calculations combining activity + emotions + situational awareness

## Development Commands

### Essential Commands
```bash
# Development with auto-reload
bun run dev

# Standard startup
bun start

# Production build and run
bun run build
bun run prod

# Type checking
bun run type-check
```

### Analysis & Utilities
```bash
# Analyze chat export data
bun run analyze

# Extract personality patterns from chat
bun run patterns

# Test AI response generation
bun run test-ai

# View memory statistics  
bun run memory-stats

# Generate mock data for testing
bun run generate-mock
```

### Memory Management
```bash
# View memory for specific chat
bun run memory-stats 316537427

# Import historical chat data
bun run import-history.js
```

## Configuration

### Environment Variables (.env)
```bash
# Core bot settings
TELEGRAM_BOT_TOKEN=your_bot_token
ALLOWED_CHAT_ID=optional_specific_chat_id
DEV_MODE=true

# AI configuration  
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-5-nano  # or gpt-5-chat-latest
AI_MODE=hybrid           # patterns_only, ai_only, hybrid
AI_PROBABILITY=0.8

# Memory settings
DATABASE_PATH=./memory.db
MEMORY_DAYS=30
SUMMARY_AFTER_MESSAGES=50
SHORT_TERM_LIMIT=25
CONTEXT_RELEVANCE_THRESHOLD=0.7
```

### Model-Specific Settings
- **GPT-5 nano**: Uses reasoning_effort='low', verbosity='low' for efficiency
- **GPT-5 chat-latest**: Uses temperature=0.7, top_p=0.95, store=true for quality

## Data Flow

1. **Message Reception** → `bot.ts` receives Telegram message
2. **Context Building** → `memory-manager.ts` builds memory context from database
3. **Response Decision** → `response-engine.ts` decides AI vs patterns based on content
4. **AI Generation** → `ai-engine.ts` generates response with memory context (if AI mode)
5. **Pattern Matching** → Falls back to `result_personality.json` patterns if needed
6. **Memory Storage** → All messages stored with extracted topics, emotions, importance

## Working with AI Models

### GPT-5 Model Differences
- **nano**: Fast, economical, lower token limits, simplified prompts
- **chat-latest**: High-quality, conversational, full context, premium features

### Prompt Engineering
- Character prompts in `buildFullPrompt()` method in `ai-engine.ts`
- Memory context automatically injected with user relationships and conversation history
- Recent personality refinement focuses on natural conversation vs forced coolness

## Memory Database Schema

### Tables
- `messages`: All chat messages with metadata
- `user_relationships`: User interaction history and relationship types
- `chat_topics`: Active topics with mention frequency
- `conversation_summaries`: Compressed conversation history

### Key Features
- Automatic importance scoring for messages
- Emotion detection and classification
- Topic extraction and tracking
- User relationship development over time

## Chat Import and Analysis

### Supported Formats
- Telegram Desktop JSON exports in `chat/result.json`
- Import script: `import-history.js` (filters last 6 months, extracts topics/emotions)
- Chat ID migration support for database consistency

### Analysis Pipeline
1. Parse raw Telegram export (`parser.ts`)
2. Extract statistical patterns (`analytics.ts`) 
3. Generate personality patterns (`pattern-extractor.ts`)
4. Build response database (`result_personality.json`)

## Character Personality

The bot simulates "Саня (Гейсандр Кулович)" with these characteristics:
- Natural conversational style without forced slang
- Contextual memory of all chat participants
- Appropriate use of casual language when fitting
- Friendly but not overly enthusiastic tone
- Ability to reference past conversations naturally

Recent refinements focused on making the character less "cringey" and more naturally conversational rather than trying too hard to seem cool.