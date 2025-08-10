import { Logger } from '../utils/logger.js';
import { MemoryEntry, UserRelationship } from '../core/types.js';

// Расширенные типы эмоций для ЭТАПА 8
export interface EmotionAnalysis {
  // Базовые эмоции (Plutchik's wheel)
  primary: {
    joy: number;       // 0-1
    sadness: number;
    anger: number;
    fear: number;
    surprise: number;
    disgust: number;
    trust: number;
    anticipation: number;
  };
  
  // Социальные эмоции
  social: {
    friendly: number;    // 0-1
    hostile: number;
    sarcastic: number;
    supportive: number;
    playful: number;
    serious: number;
  };
  
  // Контекстные эмоции
  contextual: {
    enthusiasm: number;  // 0-1
    boredom: number;
    stress: number;
    curiosity: number;
    confidence: number;
    uncertainty: number;
  };
  
  // Итоговые характеристики
  dominant: string;        // Доминирующая эмоция
  intensity: number;       // Интенсивность 0-1
  valence: number;         // Позитивность -1 до 1
  arousal: number;         // Возбуждение 0-1
  confidence: number;      // Уверенность в анализе 0-1
}

export interface EmotionalProfile {
  userId: string;
  
  // Базовые характеристики
  temperament: 'sanguine' | 'choleric' | 'melancholic' | 'phlegmatic';
  expressiveness: number; // Насколько эмоционально выражается 0-1
  stability: number;      // Эмоциональная стабильность 0-1
  
  // Паттерны эмоций
  typicalEmotions: string[];     // Часто испытываемые эмоции
  emotionalTriggers: {           // Что вызывает эмоции
    topic: string;
    emotion: string;
    strength: number;
  }[];
  
  // Социальная роль в группе
  socialRole: 'entertainer' | 'supporter' | 'challenger' | 'observer' | 'mediator' | 'leader';
  
  // Циклы настроения
  moodPatterns: {
    timeOfDay?: { [hour: string]: number };    // Настроение по часам
    dayOfWeek?: { [day: string]: number };     // Настроение по дням
  };
  
  // История эмоций
  recentMoods: {
    date: Date;
    dominantEmotion: string;
    intensity: number;
    context: string;
  }[];
}

export interface GroupEmotionalState {
  // Общее настроение группы
  groupMood: {
    dominant: string;
    intensity: number;
    stability: number;  // Насколько стабильно настроение
  };
  
  // Социальная динамика
  dynamics: {
    harmony: number;     // 0-1 Гармония в группе
    tension: number;     // 0-1 Напряженность
    energy: number;      // 0-1 Энергичность общения
    engagement: number;  // 0-1 Вовлеченность участников
  };
  
  // Активные эмоциональные темы
  emotionalTopics: {
    topic: string;
    associatedEmotion: string;
    intensity: number;
    participants: string[];
  }[];
  
  // Конфликты и их статус
  conflicts: {
    participants: string[];
    topic?: string;
    intensity: number;
    status: 'active' | 'cooling' | 'resolved';
    firstDetected: Date;
  }[];
}

export class EmotionAnalyzer {
  private emotionKeywords: { [emotion: string]: string[] } = {};
  private socialCues: { [pattern: string]: string[] } = {};
  
  constructor() {
    this.initializeEmotionPatterns();
  }
  
  private initializeEmotionPatterns(): void {
    // Ключевые слова для базовых эмоций (улучшенные)
    this.emotionKeywords = {
      joy: ['радость', 'счастье', 'весело', 'классно', 'круто', 'ахаха', 'хаха', 'лол', 'кек', 'прикольно', 'клево', 'супер', 'отлично', 'замечательно', '😄', '😂', '🎉', '👍', '🔥', '💪'],
      sadness: ['грустно', 'печально', 'плохо', 'расстроен', 'депрессия', 'тоска', 'уныние', 'печаль', 'горе', 'слезы', '😢', '😭', '💔', '😞', '😔'],
      anger: ['злость', 'бесит', 'раздражает', 'достало', 'ненавижу', 'дурак', 'идиот', 'сволочь', 'тварь', 'убью', 'задолбал', 'надоело', '😠', '😡', '🤬', 'блять', 'сука'],
      fear: ['страшно', 'боюсь', 'волнуюсь', 'тревожно', 'паника', 'ужас', 'кошмар', 'жуть', 'опасность', 'риск', '😨', '😰', '😱'],
      surprise: ['вау', 'ого', 'неожиданно', 'удивительно', 'не может быть', 'серьезно', 'офигеть', 'охренеть', 'невероятно', 'фантастика', 'нереально', '😲', '😯', '🤯', '😱'],
      trust: ['доверяю', 'верю', 'надежный', 'честный', 'искренне', 'правда', 'точно', 'согласен', 'поддерживаю', '🤝', '💪'],
      anticipation: ['жду', 'предвкушаю', 'интересно', 'любопытно', 'что дальше', 'скоро', 'наконец', 'ждем', 'когда', '🤔', '👀']
    };
    
    // Социальные сигналы (расширенные)
    this.socialCues = {
      sarcastic: ['ага', 'конечно', 'ясно', 'ну да', 'точно-точно', '/s', 'сарказм', 'очень "умно"', 'ой как', 'как же', 'вот так вот', 'молодец', 'гений'],
      supportive: ['поддерживаю', 'согласен', 'помогу', 'понимаю', 'сочувствую', '+1', 'это', 'давай', 'вместе', 'поможем', 'поддержка', 'солидарен'],
      playful: ['игра', 'прикол', 'шутка', 'розыгрыш', 'веселье', 'угар', 'потеха', 'забава', 'ржака', '😜', '😏', '😋', '🤣'],
      serious: ['серьезно', 'важно', 'проблема', 'дело', 'вопрос', 'надо', 'нужно', 'критично', 'срочно', 'внимание', 'осторожно'],
      hostile: ['против', 'не согласен', 'ерунда', 'глупость', 'неправильно', 'спор', 'бред', 'чушь', 'ложь', 'враньё', 'фигня'],
      friendly: ['привет', 'добро пожаловать', 'рад', 'приятно', 'дружище', 'братан', 'приятель', 'здорово', 'как дела', '😊', '🤗', '👋']
    };
  }
  
  /**
   * Анализирует эмоции в тексте сообщения
   */
  analyzeMessageEmotion(content: string, author: string, context?: {
    recentMessages?: MemoryEntry[];
    userProfile?: EmotionalProfile;
  }): EmotionAnalysis {
    const text = content.toLowerCase();
    
    // Анализ базовых эмоций
    const primary = this.analyzePrimaryEmotions(text);
    
    // Анализ социальных эмоций
    const social = this.analyzeSocialEmotions(text, context?.recentMessages);
    
    // Анализ контекстных эмоций
    const contextual = this.analyzeContextualEmotions(text, context);
    
    // Определяем доминирующую эмоцию
    const dominant = this.findDominantEmotion(primary, social, contextual);
    
    // Рассчитываем характеристики
    const intensity = this.calculateIntensity(text, primary, social, contextual);
    const valence = this.calculateValence(primary, social);
    const arousal = this.calculateArousal(primary, contextual);
    const confidence = this.calculateConfidence(text, dominant);
    
    Logger.debug(`🎭 Эмоция "${dominant}" (интенсивность: ${intensity.toFixed(2)}) для: "${content.substring(0, 50)}..."`);
    
    return {
      primary,
      social,
      contextual,
      dominant,
      intensity,
      valence,
      arousal,
      confidence
    };
  }
  
  private analyzePrimaryEmotions(text: string): EmotionAnalysis['primary'] {
    const emotions = {
      joy: 0, sadness: 0, anger: 0, fear: 0,
      surprise: 0, disgust: 0, trust: 0, anticipation: 0
    };
    
    for (const [emotion, keywords] of Object.entries(this.emotionKeywords)) {
      const matches = keywords.filter(keyword => text.includes(keyword)).length;
      if (emotions.hasOwnProperty(emotion)) {
        // Увеличиваем коэффициент с 0.3 до 0.5 для лучшей чувствительности
        emotions[emotion as keyof typeof emotions] = Math.min(matches * 0.5, 1.0);
      }
    }
    
    return emotions;
  }
  
  private analyzeSocialEmotions(text: string, recentMessages?: MemoryEntry[]): EmotionAnalysis['social'] {
    const emotions = {
      friendly: 0, hostile: 0, sarcastic: 0,
      supportive: 0, playful: 0, serious: 0
    };
    
    for (const [pattern, keywords] of Object.entries(this.socialCues)) {
      const matches = keywords.filter(keyword => text.includes(keyword)).length;
      if (emotions.hasOwnProperty(pattern)) {
        // Увеличиваем коэффициент с 0.4 до 0.6 для социальных эмоций
        emotions[pattern as keyof typeof emotions] = Math.min(matches * 0.6, 1.0);
      }
    }
    
    // Контекстная корректировка на основе недавних сообщений
    if (recentMessages && recentMessages.length > 0) {
      const recentText = recentMessages.slice(-3).map(m => m.content.toLowerCase()).join(' ');
      
      // Если в недавних сообщениях был конфликт, повышаем вероятность серьезности
      if (recentText.includes('спор') || recentText.includes('не согласен')) {
        emotions.serious = Math.min(emotions.serious + 0.2, 1.0);
      }
      
      // Если много смеха, повышаем игривость
      if ((recentText.match(/ха+/g) || []).length > 2) {
        emotions.playful = Math.min(emotions.playful + 0.3, 1.0);
      }
    }
    
    return emotions;
  }
  
  private analyzeContextualEmotions(text: string, context?: {
    recentMessages?: MemoryEntry[];
    userProfile?: EmotionalProfile;
  }): EmotionAnalysis['contextual'] {
    const emotions = {
      enthusiasm: 0, boredom: 0, stress: 0,
      curiosity: 0, confidence: 0, uncertainty: 0
    };
    
    // Энтузиазм - много восклицательных знаков, капс, позитивные слова интереса
    const exclamationCount = (text.match(/!/g) || []).length;
    const capsRatio = (text.match(/[A-ZА-Я]/g) || []).length / text.length;
    const enthusiasmWords = ['невероятно', 'интересно', 'вау', 'клево', 'круто', 'потрясающе', 'фантастика'];
    const enthusiasmMatches = enthusiasmWords.filter(word => text.includes(word)).length;
    emotions.enthusiasm = Math.min((exclamationCount * 0.3) + (capsRatio * 2) + (enthusiasmMatches * 0.4), 1.0);
    
    // Скука - короткие ответы, "ок", "да", "не знаю"
    const boringWords = ['ок', 'да', 'не знаю', 'пофиг', 'все равно'];
    const boringMatches = boringWords.filter(word => text.includes(word)).length;
    emotions.boredom = Math.min(boringMatches * 0.3, 1.0);
    
    // Стресс - слова спешки, проблем
    const stressWords = ['быстро', 'срочно', 'проблема', 'некогда', 'дедлайн', 'аврал'];
    const stressMatches = stressWords.filter(word => text.includes(word)).length;
    emotions.stress = Math.min(stressMatches * 0.4, 1.0);
    
    // Любопытство - вопросы
    const questionCount = (text.match(/\?/g) || []).length;
    const curiosityWords = ['почему', 'как', 'что', 'интересно', 'а что если'];
    const curiosityMatches = curiosityWords.filter(word => text.includes(word)).length;
    emotions.curiosity = Math.min((questionCount * 0.2) + (curiosityMatches * 0.3), 1.0);
    
    // Уверенность vs неуверенность
    const confidentWords = ['точно', 'определенно', 'уверен', 'знаю'];
    const uncertainWords = ['может быть', 'наверное', 'не уверен', 'думаю'];
    
    emotions.confidence = Math.min(confidentWords.filter(w => text.includes(w)).length * 0.4, 1.0);
    emotions.uncertainty = Math.min(uncertainWords.filter(w => text.includes(w)).length * 0.4, 1.0);
    
    return emotions;
  }
  
  private findDominantEmotion(
    primary: EmotionAnalysis['primary'],
    social: EmotionAnalysis['social'],
    contextual: EmotionAnalysis['contextual']
  ): string {
    const allEmotions = { ...primary, ...social, ...contextual };
    
    let maxValue = 0;
    let dominantEmotion = 'neutral';
    
    for (const [emotion, value] of Object.entries(allEmotions)) {
      if (value > maxValue) {
        maxValue = value;
        dominantEmotion = emotion;
      }
    }
    
    // Снижаем порог с 0.2 до 0.1 для более чувствительного определения эмоций
    return maxValue > 0.1 ? dominantEmotion : 'neutral';
  }
  
  private calculateIntensity(
    text: string,
    primary: EmotionAnalysis['primary'],
    social: EmotionAnalysis['social'],
    contextual: EmotionAnalysis['contextual']
  ): number {
    // Базовая интенсивность от эмоций
    const allValues = [...Object.values(primary), ...Object.values(social), ...Object.values(contextual)];
    const baseIntensity = Math.max(...allValues);
    
    // Модификаторы интенсивности
    const exclamationCount = (text.match(/!/g) || []).length;
    const capsRatio = (text.match(/[A-ZА-Я]/g) || []).length / text.length;
    const lengthFactor = Math.min(text.length / 100, 1.0); // Длинные сообщения = больше эмоций
    
    const intensityModifier = (exclamationCount * 0.1) + (capsRatio * 0.5) + (lengthFactor * 0.2);
    
    return Math.min(baseIntensity + intensityModifier, 1.0);
  }
  
  private calculateValence(
    primary: EmotionAnalysis['primary'],
    social: EmotionAnalysis['social']
  ): number {
    // Позитивные эмоции
    const positive = primary.joy + primary.trust + primary.surprise * 0.5 + 
                    social.friendly + social.supportive + social.playful;
    
    // Негативные эмоции
    const negative = primary.sadness + primary.anger + primary.fear + primary.disgust +
                    social.hostile + social.sarcastic * 0.3;
    
    return Math.max(-1, Math.min(1, (positive - negative) * 0.5));
  }
  
  private calculateArousal(
    primary: EmotionAnalysis['primary'],
    contextual: EmotionAnalysis['contextual']
  ): number {
    // Возбуждающие эмоции
    const highArousal = primary.anger + primary.fear + primary.joy + primary.surprise +
                       contextual.enthusiasm + contextual.stress;
    
    // Успокаивающие эмоции
    const lowArousal = primary.sadness + primary.trust + contextual.boredom;
    
    return Math.max(0, Math.min(1, highArousal - lowArousal * 0.5));
  }
  
  private calculateConfidence(text: string, dominantEmotion: string): number {
    // Базовая уверенность зависит от наличия явных эмоциональных индикаторов
    const emotionalIndicators = (text.match(/[!?]|[\u{1F600}-\u{1F64F}]|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{1F700}-\u{1F77F}|\u{1F780}-\u{1F7FF}|\u{1F800}-\u{1F8FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}/gu) || []).length;
    const textLength = text.length;
    
    let confidence = Math.min(emotionalIndicators * 0.1 + Math.min(textLength / 50, 1.0) * 0.3, 0.9);
    
    // Снижаем уверенность для neutral
    if (dominantEmotion === 'neutral') {
      confidence *= 0.5;
    }
    
    return Math.max(0.1, confidence);
  }
  
  /**
   * Создает эмоциональный профиль пользователя на основе истории
   */
  buildEmotionalProfile(
    userId: string,
    messageHistory: MemoryEntry[],
    relationship?: UserRelationship
  ): EmotionalProfile {
    Logger.info(`🎭 Строим эмоциональный профиль для ${userId} (${messageHistory.length} сообщений)`);
    
    // Анализируем все сообщения пользователя
    const emotionAnalyses = messageHistory.map(msg => 
      this.analyzeMessageEmotion(msg.content, msg.author)
    );
    
    // Определяем темперамент
    const temperament = this.determineTemperament(emotionAnalyses);
    
    // Рассчитываем характеристики
    const expressiveness = this.calculateExpressiveness(emotionAnalyses);
    const stability = this.calculateEmotionalStability(emotionAnalyses);
    
    // Находим типичные эмоции
    const typicalEmotions = this.findTypicalEmotions(emotionAnalyses);
    
    // Определяем социальную роль
    const socialRole = this.determineSocialRole(emotionAnalyses, messageHistory);
    
    // Извлекаем недавние настроения
    const recentMoods = emotionAnalyses.slice(-10).map((analysis, i) => ({
      date: messageHistory[messageHistory.length - 10 + i]?.timestamp || new Date(),
      dominantEmotion: analysis.dominant,
      intensity: analysis.intensity,
      context: messageHistory[messageHistory.length - 10 + i]?.content.substring(0, 50) || ''
    }));
    
    Logger.info(`✅ Профиль ${userId}: ${temperament}, роль: ${socialRole}, эмоциональность: ${(expressiveness * 100).toFixed(0)}%`);
    
    return {
      userId,
      temperament,
      expressiveness,
      stability,
      typicalEmotions,
      emotionalTriggers: [], // TODO: Analyze topics and their emotional triggers
      socialRole,
      moodPatterns: {}, // TODO: Analyze time patterns
      recentMoods
    };
  }
  
  private determineTemperament(analyses: EmotionAnalysis[]): EmotionalProfile['temperament'] {
    if (analyses.length === 0) return 'phlegmatic';
    
    const avgPositive = analyses.reduce((sum, a) => sum + a.valence, 0) / analyses.length;
    const avgArousal = analyses.reduce((sum, a) => sum + a.arousal, 0) / analyses.length;
    
    if (avgPositive > 0.2 && avgArousal > 0.6) return 'sanguine';     // Весельчак
    if (avgPositive < -0.2 && avgArousal > 0.6) return 'choleric';    // Вспыльчивый
    if (avgPositive < -0.2 && avgArousal < 0.4) return 'melancholic'; // Меланхолик
    return 'phlegmatic'; // Спокойный
  }
  
  private calculateExpressiveness(analyses: EmotionAnalysis[]): number {
    const avgIntensity = analyses.reduce((sum, a) => sum + a.intensity, 0) / analyses.length;
    return Math.min(avgIntensity * 1.2, 1.0);
  }
  
  private calculateEmotionalStability(analyses: EmotionAnalysis[]): number {
    if (analyses.length < 2) return 0.5;
    
    const valences = analyses.map(a => a.valence);
    const variance = this.calculateVariance(valences);
    
    // Меньше дисперсии = больше стабильности
    return Math.max(0, 1 - variance);
  }
  
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }
  
  private findTypicalEmotions(analyses: EmotionAnalysis[]): string[] {
    const emotionCounts: { [key: string]: number } = {};
    
    analyses.forEach(analysis => {
      if (analysis.dominant !== 'neutral') {
        emotionCounts[analysis.dominant] = (emotionCounts[analysis.dominant] || 0) + 1;
      }
    });
    
    return Object.entries(emotionCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([emotion]) => emotion);
  }
  
  private determineSocialRole(
    analyses: EmotionAnalysis[],
    messages: MemoryEntry[]
  ): EmotionalProfile['socialRole'] {
    if (analyses.length === 0) return 'observer';
    
    const avgPlayfulness = analyses.reduce((sum, a) => sum + a.social.playful, 0) / analyses.length;
    const avgSupport = analyses.reduce((sum, a) => sum + a.social.supportive, 0) / analyses.length;
    const avgHostile = analyses.reduce((sum, a) => sum + a.social.hostile, 0) / analyses.length;
    const messageLength = messages.reduce((sum, m) => sum + m.content.length, 0) / messages.length;
    
    if (avgPlayfulness > 0.4) return 'entertainer';
    if (avgSupport > 0.4) return 'supporter';
    if (avgHostile > 0.3) return 'challenger';
    if (messageLength > 100) return 'leader';
    if (messages.length < 10) return 'observer';
    
    return 'mediator';
  }
  
  /**
   * Анализирует групповое эмоциональное состояние
   */
  analyzeGroupEmotions(
    recentMessages: MemoryEntry[],
    userProfiles: Map<string, EmotionalProfile>
  ): GroupEmotionalState {
    Logger.info(`🎭 Анализируем групповое настроение (${recentMessages.length} сообщений, ${userProfiles.size} профилей)`);
    
    // Анализируем эмоции в недавних сообщениях
    const analyses = recentMessages.map(msg => 
      this.analyzeMessageEmotion(msg.content, msg.author, {
        userProfile: userProfiles.get(msg.author)
      })
    );
    
    // Определяем общее настроение группы
    const groupMood = this.calculateGroupMood(analyses);
    
    // Анализируем социальную динамику
    const dynamics = this.analyzeSocialDynamics(analyses, recentMessages);
    
    // Находим эмоциональные темы
    const emotionalTopics = this.extractEmotionalTopics(recentMessages, analyses);
    
    // Детектируем конфликты
    const conflicts = this.detectConflicts(recentMessages, analyses);
    
    Logger.info(`✅ Групповое настроение: ${groupMood.dominant} (гармония: ${(dynamics.harmony * 100).toFixed(0)}%)`);
    
    return {
      groupMood,
      dynamics,
      emotionalTopics,
      conflicts
    };
  }
  
  private calculateGroupMood(analyses: EmotionAnalysis[]): GroupEmotionalState['groupMood'] {
    if (analyses.length === 0) {
      return { dominant: 'neutral', intensity: 0, stability: 0.5 };
    }
    
    // Находим доминирующую эмоцию группы
    const emotionCounts: { [key: string]: number } = {};
    let totalIntensity = 0;
    
    analyses.forEach(analysis => {
      emotionCounts[analysis.dominant] = (emotionCounts[analysis.dominant] || 0) + 1;
      totalIntensity += analysis.intensity;
    });
    
    const dominant = Object.entries(emotionCounts)
      .sort(([,a], [,b]) => b - a)[0][0];
      
    const intensity = totalIntensity / analyses.length;
    
    // Рассчитываем стабильность как обратное к разнообразию эмоций
    const uniqueEmotions = Object.keys(emotionCounts).length;
    const stability = Math.max(0, 1 - (uniqueEmotions - 1) * 0.2);
    
    return { dominant, intensity, stability };
  }
  
  private analyzeSocialDynamics(
    analyses: EmotionAnalysis[],
    messages: MemoryEntry[]
  ): GroupEmotionalState['dynamics'] {
    if (analyses.length === 0) {
      return { harmony: 0.5, tension: 0, energy: 0, engagement: 0 };
    }
    
    // Гармония = больше дружелюбия и поддержки, меньше враждебности
    const avgFriendly = analyses.reduce((sum, a) => sum + a.social.friendly, 0) / analyses.length;
    const avgSupportive = analyses.reduce((sum, a) => sum + a.social.supportive, 0) / analyses.length;
    const avgHostile = analyses.reduce((sum, a) => sum + a.social.hostile, 0) / analyses.length;
    const harmony = Math.max(0, (avgFriendly + avgSupportive - avgHostile));
    
    // Напряжение = враждебность + стресс + конфликтные паттерны
    const avgStress = analyses.reduce((sum, a) => sum + a.contextual.stress, 0) / analyses.length;
    const tension = Math.min(1, avgHostile + avgStress);
    
    // Энергия = общая интенсивность эмоций
    const energy = analyses.reduce((sum, a) => sum + a.intensity, 0) / analyses.length;
    
    // Вовлеченность = разнообразие участников и длина сообщений
    const uniqueParticipants = new Set(messages.map(m => m.author)).size;
    const avgMessageLength = messages.reduce((sum, m) => sum + m.content.length, 0) / messages.length;
    const engagement = Math.min(1, (uniqueParticipants * 0.2) + Math.min(avgMessageLength / 50, 1) * 0.4);
    
    return { harmony, tension, energy, engagement };
  }
  
  private extractEmotionalTopics(
    messages: MemoryEntry[],
    analyses: EmotionAnalysis[]
  ): GroupEmotionalState['emotionalTopics'] {
    // Простая реализация - группируем по темам из сообщений
    const topicEmotions: { [topic: string]: { emotions: string[], participants: Set<string>, intensity: number } } = {};
    
    messages.forEach((msg, i) => {
      const analysis = analyses[i];
      if (analysis && analysis.dominant !== 'neutral' && msg.topics) {
        msg.topics.forEach(topic => {
          if (!topicEmotions[topic]) {
            topicEmotions[topic] = { emotions: [], participants: new Set(), intensity: 0 };
          }
          
          topicEmotions[topic].emotions.push(analysis.dominant);
          topicEmotions[topic].participants.add(msg.author);
          topicEmotions[topic].intensity = Math.max(topicEmotions[topic].intensity, analysis.intensity);
        });
      }
    });
    
    return Object.entries(topicEmotions)
      .map(([topic, data]) => ({
        topic,
        associatedEmotion: data.emotions[0] || 'neutral', // Берем первую эмоцию
        intensity: data.intensity,
        participants: Array.from(data.participants)
      }))
      .filter(t => t.participants.length >= 1);
  }
  
  private detectConflicts(
    messages: MemoryEntry[],
    analyses: EmotionAnalysis[]
  ): GroupEmotionalState['conflicts'] {
    const conflicts: GroupEmotionalState['conflicts'] = [];
    
    // Простая детекция - ищем последовательность враждебных сообщений между разными участниками
    for (let i = 1; i < analyses.length; i++) {
      const current = analyses[i];
      const prev = analyses[i - 1];
      const currentMsg = messages[i];
      const prevMsg = messages[i - 1];
      
      if (current.social.hostile > 0.3 && 
          prev.social.hostile > 0.3 &&
          currentMsg.author !== prevMsg.author) {
        
        // Проверяем, не добавили ли уже этот конфликт
        const existingConflict = conflicts.find(c => 
          c.participants.includes(currentMsg.author) && c.participants.includes(prevMsg.author)
        );
        
        if (!existingConflict) {
          conflicts.push({
            participants: [prevMsg.author, currentMsg.author],
            intensity: (current.social.hostile + prev.social.hostile) / 2,
            status: 'active',
            firstDetected: prevMsg.timestamp
          });
        }
      }
    }
    
    return conflicts;
  }
}