#!/usr/bin/env bun

/**
 * Тестирование системы анализа повторений Гейсандра Куловича
 */

import { config } from "../core/config.js";
import { Logger } from "../utils/logger.js";
import { AIEngine } from "./ai-engine.js";
import { BotPersonality, ChatContext } from "../core/types.js";

// Моковая личность для тестирования
const mockPersonality: BotPersonality = {
  patterns: [],
  responseStyle: {
    averageLength: 45,
    commonWords: ["да", "нет", "норм"],
    commonEmojis: ["😄", "👍"],
    formalityLevel: 0.2,
    activityLevel: 0.7
  },
  schedule: {
    activeHours: [9, 10, 11, 18, 19, 20],
    activeDays: [1, 2, 3, 4, 5]
  }
};

class RepetitionTester {
  private aiEngine: AIEngine;

  constructor() {
    this.aiEngine = new AIEngine(mockPersonality);
  }

  /**
   * Тестирует алгоритм вычисления схожести строк
   */
  testSimilarity() {
    console.log("\n🧪 ТЕСТ АЛГОРИТМА СХОЖЕСТИ СТРОК");
    console.log("═".repeat(50));

    const testCases = [
      // Точные повторения
      { str1: "привет как дела", str2: "привет как дела", expected: 1.0 },
      
      // Очень похожие строки
      { str1: "как дела?", str2: "как дела", expected: 0.9 },
      { str1: "что делаешь", str2: "что делаешь?", expected: 0.92 },
      
      // Умеренно похожие
      { str1: "привет", str2: "приветик", expected: 0.75 },
      { str1: "как жизнь", str2: "как дела", expected: 0.5 },
      
      // Разные строки
      { str1: "привет", str2: "пока", expected: 0.0 },
      { str1: "что делаешь", str2: "спокойной ночи", expected: 0.1 }
    ];

    for (const testCase of testCases) {
      const similarity = (this.aiEngine as any).calculateSimilarity(testCase.str1, testCase.str2);
      const passed = Math.abs(similarity - testCase.expected) < 0.2; // погрешность 20%
      
      console.log(
        `${passed ? "✅" : "❌"} "${testCase.str1}" ↔ "${testCase.str2}"`
      );
      console.log(
        `   Схожесть: ${similarity.toFixed(3)} (ожидалось: ${testCase.expected})`
      );
    }
  }

  /**
   * Тестирует анализ повторений
   */
  testRepetitionAnalysis() {
    console.log("\n🔄 ТЕСТ АНАЛИЗА ПОВТОРЕНИЙ");
    console.log("═".repeat(50));

    // Создаем контекст с повторяющимися сообщениями
    const testScenarios = [
      {
        name: "Нет повторений",
        messages: [
          { author: "Володя", text: "привет" },
          { author: "Володя", text: "как дела" },
          { author: "Володя", text: "что нового" }
        ],
        currentMessage: "где ты",
        expectedLevel: "none"
      },
      
      {
        name: "Легкие повторения (2-3 раза)",
        messages: [
          { author: "Володя", text: "привет" },
          { author: "Володя", text: "привет" },
          { author: "Володя", text: "как дела" }
        ],
        currentMessage: "привет",
        expectedLevel: "mild"
      },
      
      {
        name: "Умеренные повторения (4-5 раз)",
        messages: [
          { author: "Володя", text: "где ты" },
          { author: "Володя", text: "где ты?" },
          { author: "Володя", text: "где ты" },
          { author: "Володя", text: "где ты???" }
        ],
        currentMessage: "где ты",
        expectedLevel: "moderate"
      },
      
      {
        name: "Высокие повторения (6+ раз)",
        messages: [
          { author: "Володя", text: "ответь" },
          { author: "Володя", text: "ответь!" },
          { author: "Володя", text: "ответь!!" },
          { author: "Володя", text: "ответь" },
          { author: "Володя", text: "ответь!!!" },
          { author: "Володя", text: "ответь пожалуйста" }
        ],
        currentMessage: "ответь",
        expectedLevel: "high"
      }
    ];

    for (const scenario of testScenarios) {
      console.log(`\n📝 Сценарий: ${scenario.name}`);
      
      const context: ChatContext = {
        recentMessages: scenario.messages.map(msg => ({
          text: msg.text,
          author: msg.author,
          timestamp: new Date()
        })),
        activeUsers: new Set(["Володя"]),
        messagesSinceLastResponse: 0
      };

      const analysis = (this.aiEngine as any).analyzeRepetition(
        scenario.currentMessage,
        "Володя",
        context
      );

      const passed = analysis.irritationLevel === scenario.expectedLevel;
      
      console.log(`   ${passed ? "✅" : "❌"} Повторений: ${analysis.repetitionCount}`);
      console.log(`   ${passed ? "✅" : "❌"} Уровень раздражения: ${analysis.irritationLevel} (ожидалось: ${scenario.expectedLevel})`);
      console.log(`   Должен адаптировать промпт: ${analysis.shouldAdaptPrompt}`);
    }
  }

  /**
   * Тестирует генерацию ответов с учетом повторений
   */
  async testResponseGeneration() {
    console.log("\n🤖 ТЕСТ ГЕНЕРАЦИИ ОТВЕТОВ НА ПОВТОРЕНИЯ");
    console.log("═".repeat(50));

    if (!config.openaiApiKey) {
      console.log("⚠️ OpenAI API ключ не настроен, пропускаем тест генерации");
      return;
    }

    const testScenarios = [
      {
        name: "Первый раз спрашивает",
        messages: [
          { author: "Володя", text: "как дела братан" }
        ],
        currentMessage: "что делаешь",
        expectedMood: "normal"
      },
      
      {
        name: "Легкое повторение",
        messages: [
          { author: "Володя", text: "что делаешь" },
          { author: "Володя", text: "что делаешь?" },
          { author: "Другой", text: "привет всем" }
        ],
        currentMessage: "что делаешь",
        expectedMood: "mild_irritation"
      },
      
      {
        name: "Сильное повторение",
        messages: [
          { author: "Володя", text: "ответь" },
          { author: "Володя", text: "ответь!" },
          { author: "Володя", text: "ответь!!" },
          { author: "Володя", text: "ответь!!!" },
          { author: "Володя", text: "ответь пожалуйста" },
          { author: "Володя", text: "ответь же" }
        ],
        currentMessage: "ответь",
        expectedMood: "high_irritation"
      }
    ];

    for (const scenario of testScenarios) {
      console.log(`\n📝 Сценарий: ${scenario.name}`);
      
      const context: ChatContext = {
        recentMessages: scenario.messages.map(msg => ({
          text: msg.text,
          author: msg.author,
          timestamp: new Date()
        })),
        activeUsers: new Set(["Володя"]),
        messagesSinceLastResponse: 0
      };

      try {
        const response = await this.aiEngine.generateResponse(
          scenario.currentMessage,
          "Володя",
          context
        );

        if (response) {
          console.log(`   🤖 Ответ Гейсандра: "${response}"`);
          
          // Анализируем тон ответа
          const lowerResponse = response.toLowerCase();
          if (scenario.expectedMood === "high_irritation") {
            const hasIrritation = lowerResponse.includes("нахуй") || 
                                lowerResponse.includes("достал") || 
                                lowerResponse.includes("задолбал") ||
                                lowerResponse.includes("охуел");
            console.log(`   ${hasIrritation ? "✅" : "❌"} Показывает высокое раздражение`);
          } else if (scenario.expectedMood === "mild_irritation") {
            const hasMildIrritation = lowerResponse.includes("же") ||
                                    lowerResponse.includes("повтор") ||
                                    lowerResponse.includes("уже говорил") ||
                                    lowerResponse.includes("зациклил");
            console.log(`   ${hasMildIrritation ? "✅" : "⚠️"} Показывает легкое раздражение`);
          } else {
            console.log(`   ✅ Нормальный ответ без раздражения`);
          }
        } else {
          console.log(`   ❌ AI не смог сгенерировать ответ`);
        }
      } catch (error) {
        console.log(`   ❌ Ошибка генерации: ${error}`);
      }
      
      // Небольшая пауза между запросами
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Запускает все тесты
   */
  async runAllTests() {
    console.log("🧪 ТЕСТИРОВАНИЕ СИСТЕМЫ АНАЛИЗА ПОВТОРЕНИЙ");
    console.log("═".repeat(60));
    console.log(`Модель: ${config.openaiModel || 'не настроена'}`);
    console.log(`AI режим: ${config.aiMode}`);
    
    this.testSimilarity();
    this.testRepetitionAnalysis();
    await this.testResponseGeneration();
    
    console.log("\n✅ ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ");
    console.log("═".repeat(60));
  }
}

// Запускаем тестирование
const tester = new RepetitionTester();
tester.runAllTests().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error("❌ Ошибка тестирования:", error);
  process.exit(1);
});
