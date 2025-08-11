# Self-hosted GitHub Runner для Synology NAS

## Быстрая настройка

1. **Создайте runner в GitHub:**
   ```
   Settings → Actions → Runners → New self-hosted runner
   ```

2. **Выберите macOS/Linux** и скопируйте команды

3. **Запустите на этой машине:**
   ```bash
   # Создайте папку для runner
   mkdir actions-runner && cd actions-runner
   
   # Скачайте (команды из GitHub)
   curl -o actions-runner-osx-x64-2.311.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-osx-x64-2.311.0.tar.gz
   
   # Распакуйте
   tar xzf ./actions-runner-osx-x64-2.311.0.tar.gz
   
   # Настройте (с токеном из GitHub)
   ./config.sh --url https://github.com/voovvaa/pavel --token YOUR_TOKEN
   
   # Запустите
   ./run.sh
   ```

4. **Обновите workflow:**
   ```yaml
   runs-on: self-hosted  # вместо ubuntu-latest
   ```

## Преимущества:
- ✅ Прямой доступ к локальной сети
- ✅ Быстрая сборка (локальная машина)
- ✅ Доступ к SSH ключам
- ✅ Не нужен внешний доступ к NAS