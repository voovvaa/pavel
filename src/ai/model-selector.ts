import select from '@inquirer/select';
import { Logger } from '../utils/logger.js';

export interface ModelConfig {
  model: string;
  displayName: string;
  description: string;
  pricing: string;
  isReasoning: boolean;
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    model: 'gpt-5-nano',
    displayName: 'GPT-5 Nano (РЕКОМЕНДУЕТСЯ)',
    description: 'Самая быстрая и экономичная модель без reasoning',
    pricing: '$0.05/1M входящих, $0.40/1M исходящих (~$0.03/месяц)',
    isReasoning: false
  },
  {
    model: 'gpt-5-chat-latest', 
    displayName: 'GPT-5 Chat Latest (ПРЕМИУМ)',
    description: 'Самая умная модель без reasoning токенов',
    pricing: '$1.25/1M входящих, $10/1M исходящих (~$0.64/месяц)',
    isReasoning: false
  }
];

export class ModelSelector {
  async ensureModelConfigured(): Promise<void> {
    // Проверяем если модель уже настроена
    if (process.env.OPENAI_MODEL) {
      Logger.info(`🤖 Используем модель: ${process.env.OPENAI_MODEL}`);
      return;
    }
    
    // Выбираем модель интерактивно
    Logger.info('🤖 Модель не настроена, выбираем...');
    const model = await selectModel();
    process.env.OPENAI_MODEL = model;
    
    // Также обновляем config объект для текущего процесса
    const { config } = await import('../core/config.js');
    (config as any).openaiModel = model;
    
    // Сохраняем выбор в .env файл для следующего запуска
    await this.saveModelToEnv(model);
  }
  
  private async saveModelToEnv(model: string): Promise<void> {
    try {
      const { promises: fs } = await import('fs');
      const envPath = '.env';
      
      let envContent = '';
      try {
        envContent = await fs.readFile(envPath, 'utf-8');
      } catch {
        // Файл не существует, создаем новый
      }
      
      // Обновляем или добавляем OPENAI_MODEL
      const lines = envContent.split('\n');
      let modelLineExists = false;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('OPENAI_MODEL=')) {
          lines[i] = `OPENAI_MODEL=${model}`;
          modelLineExists = true;
          break;
        }
      }
      
      if (!modelLineExists) {
        lines.push(`OPENAI_MODEL=${model}`);
      }
      
      await fs.writeFile(envPath, lines.join('\n'));
      Logger.info(`💾 Модель ${model} сохранена в .env`);
    } catch (error) {
      Logger.warn(`Не удалось сохранить модель в .env: ${error}`);
    }
  }
}

export async function selectModel(): Promise<string> {
  console.log('\n🤖 Выберите модель для Гейсандра Куловича:\n');
  
  const choices = AVAILABLE_MODELS.map(config => ({
    name: config.displayName,
    value: config.model,
    description: `${config.description} | ${config.pricing}`
  }));

  try {
    const selectedModel = await select({
      message: 'Какую модель использовать?',
      choices,
      pageSize: 10
    });

    const selectedConfig = AVAILABLE_MODELS.find(c => c.model === selectedModel);
    if (selectedConfig) {
      console.log(`\n✅ Выбрана модель: ${selectedConfig.displayName}`);
      console.log(`💰 Стоимость: ${selectedConfig.pricing}`);
      console.log(`📝 Описание: ${selectedConfig.description}\n`);
    }

    return selectedModel;
  } catch (error: any) {
    if (error.name === 'ExitPromptError') {
      console.log('\n👋 Выход из программы...');
      process.exit(0);
    }
    throw error;
  }
}