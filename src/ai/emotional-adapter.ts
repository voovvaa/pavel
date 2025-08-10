import { Logger } from '../utils/logger.js';
import { EmotionAnalysis, EmotionalProfile, GroupEmotionalState } from './emotion-analyzer.js';
import { MemoryContext } from '../core/types.js';

/**
 * Адаптер поведения под эмоциональные состояния (ЭТАП 8)
 * 
 * Адаптирует стиль и содержание ответов Гейсандра под:
 * - Эмоциональное состояние пользователей
 * - Групповую динамику
 * - Конфликты и напряжения
 * - Социальные роли участников
 */

export interface EmotionalAdaptation {
  // Стиль ответа
  responseStyle: {
    tone: 'supportive' | 'playful' | 'serious' | 'neutral' | 'calming' | 'energetic';
    formality: number;     // 0-1 (неформальный - формальный)
    energy: number;        // 0-1 (спокойный - энергичный)  
    empathy: number;       // 0-1 (нейтральный - эмпатичный)
    humor: number;         // 0-1 (серьезный - веселый)
  };
  
  // Стратегии общения
  strategies: {
    shouldComfort: boolean;        // Утешать при грусти
    shouldDeescalate: boolean;     // Успокаивать при конфликте
    shouldEnergize: boolean;       // Поднимать настроение
    shouldMatchEnergy: boolean;    // Соответствовать энергии группы
    shouldBeMediator: boolean;     // Выступать медиатором
  };
  
  // Специальные инструкции для AI
  promptAdjustments: {
    emotionalContext: string;      // Контекст эмоций для промпта
    behaviorInstructions: string;  // Инструкции поведения
    avoidTopics?: string[];        // Темы которых стоит избежать
    emphasizeTopics?: string[];    // Темы на которых стоит сосредоточиться
  };
  
  // Вероятность ответа
  responseModifier: number; // 0-2 (множитель базовой вероятности ответа)
}

export class EmotionalAdapter {
  
  constructor() {
    Logger.info('🎭 EmotionalAdapter инициализирован');
  }
  
  /**
   * Анализирует эмоциональное состояние и создает адаптацию
   */
  adaptToEmotionalState(
    currentUser: string,
    userMessage: string,
    memoryContext: MemoryContext
  ): EmotionalAdaptation {
    
    Logger.debug(`🎭 Адаптируем поведение для сообщения "${userMessage.substring(0, 30)}..." от ${currentUser}`);
    
    // Получаем эмоциональный профиль пользователя
    const userRelationship = memoryContext.userRelationships.get(currentUser);
    const userProfile = userRelationship?.emotionalProfile;
    const groupState = memoryContext.groupEmotionalState;
    
    // Базовая адаптация
    let adaptation: EmotionalAdaptation = {
      responseStyle: {
        tone: 'neutral',
        formality: 0.3,
        energy: 0.5,
        empathy: 0.5,
        humor: 0.4
      },
      strategies: {
        shouldComfort: false,
        shouldDeescalate: false,
        shouldEnergize: false,
        shouldMatchEnergy: true,
        shouldBeMediator: false
      },
      promptAdjustments: {
        emotionalContext: '',
        behaviorInstructions: ''
      },
      responseModifier: 1.0
    };
    
    // Адаптируемся к эмоциональному профилю пользователя
    if (userProfile) {
      adaptation = this.adaptToUserProfile(adaptation, userProfile, currentUser);
    }
    
    // Адаптируемся к групповому состоянию
    if (groupState) {
      adaptation = this.adaptToGroupState(adaptation, groupState);
    }
    
    // Анализируем недавние сообщения на предмет эмоций
    const recentEmotions = this.analyzeRecentEmotions(memoryContext.recentMessages);
    adaptation = this.adaptToRecentEmotions(adaptation, recentEmotions, currentUser);
    
    // Создаем финальные инструкции
    adaptation = this.finalizePromptAdjustments(adaptation, currentUser, userProfile, groupState);
    
    Logger.info(`🎭 Адаптация для ${currentUser}: ${adaptation.responseStyle.tone} тон, эмпатия ${(adaptation.responseStyle.empathy * 100).toFixed(0)}%`);
    
    return adaptation;
  }
  
  /**
   * Адаптирует поведение под эмоциональный профиль пользователя
   */
  private adaptToUserProfile(
    adaptation: EmotionalAdaptation,
    profile: EmotionalProfile,
    userName: string
  ): EmotionalAdaptation {
    
    Logger.debug(`🎭 Адаптируемся к профилю ${userName}: ${profile.temperament}, роль: ${profile.socialRole}`);
    
    // Адаптация по темпераменту
    switch (profile.temperament) {
      case 'sanguine': // Весельчак
        adaptation.responseStyle.tone = 'playful';
        adaptation.responseStyle.energy = 0.8;
        adaptation.responseStyle.humor = 0.7;
        adaptation.strategies.shouldMatchEnergy = true;
        break;
        
      case 'choleric': // Вспыльчивый
        adaptation.responseStyle.tone = 'serious';
        adaptation.responseStyle.formality = 0.6;
        adaptation.strategies.shouldDeescalate = true;
        adaptation.responseStyle.empathy = 0.7;
        break;
        
      case 'melancholic': // Меланхолик
        adaptation.responseStyle.tone = 'supportive';
        adaptation.responseStyle.empathy = 0.9;
        adaptation.responseStyle.energy = 0.3;
        adaptation.strategies.shouldComfort = true;
        break;
        
      case 'phlegmatic': // Спокойный
        adaptation.responseStyle.tone = 'neutral';
        adaptation.responseStyle.formality = 0.5;
        adaptation.responseStyle.energy = 0.4;
        break;
    }
    
    // Адаптация по социальной роли
    switch (profile.socialRole) {
      case 'entertainer':
        adaptation.responseStyle.humor = Math.min(adaptation.responseStyle.humor + 0.3, 1.0);
        adaptation.responseStyle.energy = Math.min(adaptation.responseStyle.energy + 0.2, 1.0);
        break;
        
      case 'supporter':
        adaptation.responseStyle.empathy = Math.min(adaptation.responseStyle.empathy + 0.3, 1.0);
        adaptation.responseStyle.tone = 'supportive';
        break;
        
      case 'challenger':
        adaptation.responseStyle.formality = Math.min(adaptation.responseStyle.formality + 0.2, 1.0);
        adaptation.strategies.shouldDeescalate = true;
        break;
        
      case 'leader':
        adaptation.responseStyle.formality = Math.min(adaptation.responseStyle.formality + 0.3, 1.0);
        adaptation.responseStyle.tone = 'serious';
        break;
        
      case 'mediator':
        adaptation.strategies.shouldBeMediator = true;
        adaptation.responseStyle.empathy = Math.min(adaptation.responseStyle.empathy + 0.2, 1.0);
        break;
        
      case 'observer':
        adaptation.responseModifier *= 0.7; // Меньше шансов ответить
        adaptation.responseStyle.formality = Math.min(adaptation.responseStyle.formality + 0.1, 1.0);
        break;
    }
    
    // Учитываем эмоциональность пользователя
    if (profile.expressiveness > 0.7) {
      // Очень эмоциональный пользователь
      adaptation.responseStyle.energy = Math.min(adaptation.responseStyle.energy + 0.2, 1.0);
      adaptation.responseModifier *= 1.3; // Больше шансов ответить
    } else if (profile.expressiveness < 0.3) {
      // Мало эмоциональный пользователь
      adaptation.responseStyle.energy = Math.max(adaptation.responseStyle.energy - 0.2, 0.0);
      adaptation.responseStyle.formality = Math.min(adaptation.responseStyle.formality + 0.2, 1.0);
    }
    
    return adaptation;
  }
  
  /**
   * Адаптирует поведение под групповое эмоциональное состояние
   */
  private adaptToGroupState(
    adaptation: EmotionalAdaptation,
    groupState: GroupEmotionalState
  ): EmotionalAdaptation {
    
    Logger.debug(`🎭 Адаптируемся к групповому состоянию: ${groupState.groupMood.dominant}, гармония: ${(groupState.dynamics.harmony * 100).toFixed(0)}%`);
    
    const { groupMood, dynamics, conflicts } = groupState;
    
    // Адаптация к общему настроению группы
    switch (groupMood.dominant) {
      case 'joy':
      case 'playful':
        adaptation.responseStyle.tone = 'playful';
        adaptation.responseStyle.humor = Math.min(adaptation.responseStyle.humor + 0.3, 1.0);
        adaptation.responseStyle.energy = Math.min(adaptation.responseStyle.energy + 0.3, 1.0);
        break;
        
      case 'sadness':
      case 'melancholic':
        adaptation.responseStyle.tone = 'supportive';
        adaptation.responseStyle.empathy = Math.min(adaptation.responseStyle.empathy + 0.4, 1.0);
        adaptation.strategies.shouldComfort = true;
        break;
        
      case 'anger':
      case 'tension':
        adaptation.responseStyle.tone = 'calming';
        adaptation.strategies.shouldDeescalate = true;
        adaptation.responseStyle.energy = Math.max(adaptation.responseStyle.energy - 0.3, 0.0);
        break;
        
      case 'excitement':
      case 'energetic':
        adaptation.responseStyle.tone = 'energetic';
        adaptation.responseStyle.energy = Math.min(adaptation.responseStyle.energy + 0.4, 1.0);
        adaptation.strategies.shouldMatchEnergy = true;
        break;
    }
    
    // Реагируем на уровень гармонии
    if (dynamics.harmony < 0.4) {
      // Низкая гармония - нужно мирить
      adaptation.strategies.shouldBeMediator = true;
      adaptation.responseStyle.empathy = Math.min(adaptation.responseStyle.empathy + 0.3, 1.0);
      adaptation.responseStyle.tone = 'supportive';
      Logger.debug('🕊️ Низкая гармония группы - включаем режим медиатора');
    }
    
    // Реагируем на напряженность
    if (dynamics.tension > 0.6) {
      adaptation.strategies.shouldDeescalate = true;
      adaptation.responseStyle.tone = 'calming';
      adaptation.responseStyle.humor = Math.max(adaptation.responseStyle.humor - 0.2, 0.0);
      Logger.debug('⚡ Высокая напряженность - включаем успокаивающий режим');
    }
    
    // Реагируем на низкую энергию группы
    if (dynamics.energy < 0.3) {
      adaptation.strategies.shouldEnergize = true;
      adaptation.responseStyle.tone = 'energetic';
      adaptation.responseStyle.energy = Math.min(adaptation.responseStyle.energy + 0.3, 1.0);
      Logger.debug('🔋 Низкая энергия группы - пытаемся взбодрить');
    }
    
    // Реагируем на активные конфликты
    if (conflicts.length > 0) {
      const activeConflicts = conflicts.filter(c => c.status === 'active');
      if (activeConflicts.length > 0) {
        adaptation.strategies.shouldBeMediator = true;
        adaptation.strategies.shouldDeescalate = true;
        adaptation.responseStyle.tone = 'calming';
        adaptation.responseModifier *= 1.5; // Больше шансов ответить при конфликте
        
        // Избегаем спорных тем
        adaptation.promptAdjustments.avoidTopics = activeConflicts
          .filter(c => c.topic)
          .map(c => c.topic!);
          
        Logger.debug(`⚔️ Обнаружено ${activeConflicts.length} активных конфликтов - режим миротворца`);
      }
    }
    
    return adaptation;
  }
  
  /**
   * Анализирует эмоции в недавних сообщениях
   */
  private analyzeRecentEmotions(recentMessages: any[]): {
    dominantEmotion: string;
    intensity: number;
    trend: 'improving' | 'worsening' | 'stable';
  } {
    if (recentMessages.length === 0) {
      return { dominantEmotion: 'neutral', intensity: 0, trend: 'stable' };
    }
    
    const emotions = recentMessages
      .filter(msg => msg.emotion && msg.emotion !== 'neutral')
      .map(msg => msg.emotion);
    
    if (emotions.length === 0) {
      return { dominantEmotion: 'neutral', intensity: 0, trend: 'stable' };
    }
    
    // Находим доминирующую эмоцию
    const emotionCounts: { [key: string]: number } = {};
    emotions.forEach(emotion => {
      emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
    });
    
    const dominantEmotion = Object.entries(emotionCounts)
      .sort(([,a], [,b]) => b - a)[0][0];
    
    const intensity = Math.min(emotions.length / recentMessages.length, 1.0);
    
    // Простой анализ тренда (сравниваем первую и вторую половину)
    const mid = Math.floor(emotions.length / 2);
    const firstHalf = emotions.slice(0, mid);
    const secondHalf = emotions.slice(mid);
    
    const positiveFirst = firstHalf.filter(e => ['positive', 'joy', 'excited', 'funny'].includes(e)).length;
    const positiveSecond = secondHalf.filter(e => ['positive', 'joy', 'excited', 'funny'].includes(e)).length;
    
    let trend: 'improving' | 'worsening' | 'stable' = 'stable';
    if (positiveSecond > positiveFirst) trend = 'improving';
    else if (positiveSecond < positiveFirst) trend = 'worsening';
    
    return { dominantEmotion, intensity, trend };
  }
  
  /**
   * Адаптирует поведение к недавним эмоциям
   */
  private adaptToRecentEmotions(
    adaptation: EmotionalAdaptation,
    recentEmotions: { dominantEmotion: string; intensity: number; trend: string },
    currentUser: string
  ): EmotionalAdaptation {
    
    const { dominantEmotion, intensity, trend } = recentEmotions;
    
    Logger.debug(`🎭 Недавние эмоции: ${dominantEmotion} (${(intensity * 100).toFixed(0)}%), тренд: ${trend}`);
    
    // Реагируем на доминирующую эмоцию
    switch (dominantEmotion) {
      case 'sad':
      case 'negative':
        adaptation.strategies.shouldComfort = true;
        adaptation.responseStyle.empathy = Math.min(adaptation.responseStyle.empathy + 0.4, 1.0);
        adaptation.responseStyle.tone = 'supportive';
        break;
        
      case 'angry':
        adaptation.strategies.shouldDeescalate = true;
        adaptation.responseStyle.tone = 'calming';
        adaptation.responseStyle.empathy = Math.min(adaptation.responseStyle.empathy + 0.3, 1.0);
        break;
        
      case 'excited':
      case 'positive':
        adaptation.strategies.shouldMatchEnergy = true;
        adaptation.responseStyle.energy = Math.min(adaptation.responseStyle.energy + 0.3, 1.0);
        adaptation.responseStyle.tone = 'playful';
        break;
        
      case 'funny':
        adaptation.responseStyle.humor = Math.min(adaptation.responseStyle.humor + 0.4, 1.0);
        adaptation.responseStyle.tone = 'playful';
        break;
    }
    
    // Реагируем на тренд
    if (trend === 'worsening') {
      adaptation.strategies.shouldComfort = true;
      adaptation.strategies.shouldEnergize = true;
      adaptation.responseModifier *= 1.3; // Больше шансов ответить
    } else if (trend === 'improving') {
      adaptation.strategies.shouldMatchEnergy = true;
      adaptation.responseStyle.energy = Math.min(adaptation.responseStyle.energy + 0.2, 1.0);
    }
    
    // Учитываем интенсивность эмоций
    if (intensity > 0.7) {
      // Высокая эмоциональная интенсивность
      adaptation.responseModifier *= 1.4;
      adaptation.responseStyle.empathy = Math.min(adaptation.responseStyle.empathy + 0.2, 1.0);
    }
    
    return adaptation;
  }
  
  /**
   * Финализирует промпт-адаптации
   */
  private finalizePromptAdjustments(
    adaptation: EmotionalAdaptation,
    currentUser: string,
    userProfile?: EmotionalProfile,
    groupState?: GroupEmotionalState
  ): EmotionalAdaptation {
    
    let emotionalContext = '';
    let behaviorInstructions = '';
    
    // Строим эмоциональный контекст
    if (userProfile) {
      emotionalContext += `${currentUser} - ${this.getTemperamentDescription(userProfile.temperament)}, `;
      emotionalContext += `социальная роль: ${this.getSocialRoleDescription(userProfile.socialRole)}. `;
      
      if (userProfile.typicalEmotions.length > 0) {
        emotionalContext += `Обычно проявляет: ${userProfile.typicalEmotions.join(', ')}. `;
      }
    }
    
    if (groupState) {
      emotionalContext += `Общее настроение чата: ${groupState.groupMood.dominant}. `;
      
      if (groupState.dynamics.harmony < 0.5) {
        emotionalContext += 'В чате пониженная гармония, возможны разногласия. ';
      }
      
      if (groupState.dynamics.tension > 0.5) {
        emotionalContext += 'Ощущается напряженность в общении. ';
      }
      
      if (groupState.conflicts.length > 0) {
        emotionalContext += `Есть ${groupState.conflicts.length} конфликтных ситуаций. `;
      }
    }
    
    // Строим инструкции поведения
    const style = adaptation.responseStyle;
    
    switch (style.tone) {
      case 'supportive':
        behaviorInstructions += 'Будь поддерживающим и понимающим. ';
        break;
      case 'playful':
        behaviorInstructions += 'Используй игривый, веселый тон. ';
        break;
      case 'serious':
        behaviorInstructions += 'Отвечай серьезно и обдуманно. ';
        break;
      case 'calming':
        behaviorInstructions += 'Используй успокаивающий, мирный тон. ';
        break;
      case 'energetic':
        behaviorInstructions += 'Будь энергичным и мотивирующим. ';
        break;
    }
    
    if (style.empathy > 0.7) {
      behaviorInstructions += 'Проявляй больше эмпатии и понимания. ';
    }
    
    if (style.humor > 0.7) {
      behaviorInstructions += 'Можешь использовать юмор и шутки. ';
    }
    
    if (style.formality > 0.6) {
      behaviorInstructions += 'Держи более формальный тон общения. ';
    }
    
    // Стратегии
    const strategies = adaptation.strategies;
    
    if (strategies.shouldComfort) {
      behaviorInstructions += 'Постарайся утешить и поддержать. ';
    }
    
    if (strategies.shouldDeescalate) {
      behaviorInstructions += 'Помоги успокоить ситуацию, избегай провокаций. ';
    }
    
    if (strategies.shouldEnergize) {
      behaviorInstructions += 'Постарайся поднять настроение и добавить позитива. ';
    }
    
    if (strategies.shouldBeMediator) {
      behaviorInstructions += 'Выступи в роли миротворца, помоги найти компромисс. ';
    }
    
    adaptation.promptAdjustments = {
      emotionalContext: emotionalContext.trim(),
      behaviorInstructions: behaviorInstructions.trim(),
      avoidTopics: adaptation.promptAdjustments.avoidTopics || [],
      emphasizeTopics: adaptation.promptAdjustments.emphasizeTopics || []
    };
    
    return adaptation;
  }
  
  private getTemperamentDescription(temperament: string): string {
    switch (temperament) {
      case 'sanguine': return 'веселый и общительный';
      case 'choleric': return 'энергичный и вспыльчивый';
      case 'melancholic': return 'задумчивый и чувствительный';
      case 'phlegmatic': return 'спокойный и уравновешенный';
      default: return 'с неопределенным темпераментом';
    }
  }
  
  private getSocialRoleDescription(role: string): string {
    switch (role) {
      case 'entertainer': return 'развлекает группу';
      case 'supporter': return 'поддерживает других';
      case 'challenger': return 'любит дискуссии';
      case 'leader': return 'лидер обсуждений';
      case 'mediator': return 'миротворец';
      case 'observer': return 'больше наблюдает';
      default: return 'универсальная роль';
    }
  }
}