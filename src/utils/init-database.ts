#!/usr/bin/env bun

import { MemoryManager } from '../memory/memory-manager.js';
import { Logger } from './logger.js';

console.log('🗄️ Инициализируем базу данных...');

const memoryManager = new MemoryManager('init');

console.log('✅ База данных инициализирована!');
const stats = memoryManager.getMemoryStats();
console.log('📊 Статистика памяти:', stats);

memoryManager.close();
console.log('✅ Готово к импорту данных!');