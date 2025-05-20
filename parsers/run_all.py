import subprocess
import time
import pyautogui

# НАСТРОЙКИ (укажи пути под себя!)
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
USER_DATA_DIR = r"C:\DavUserChrome"
UPWORK_URL = "https://www.upwork.com/ab/account-security/login"
PUPPETEER_SCRIPT = r"C:\Users\Mane\Desktop\Python\project-main\parsers\puppeteer_upwork.js"

def start_chrome():
    subprocess.Popen([
        CHROME_PATH,
        "--remote-debugging-port=9222",
        f"--user-data-dir={USER_DATA_DIR}",
        UPWORK_URL
    ])
    print("[INFO] Открыл Chrome на странице Upwork Login")
    time.sleep(6)  # Дать время открыть страницу

def login_with_pyautogui():
    print("[INFO] Запускаем PyAutoGUI для логина...")
    time.sleep(3)  # Немного подождать, чтобы страница точно загрузилась

    # === Вводим e-mail ===
    pyautogui.moveTo(782, 490, duration=2)
    pyautogui.click()
    pyautogui.write('davmarikyan@gmail.com', interval=0.12)
    time.sleep(1)

    # === Клик Continue ===
    pyautogui.moveTo(504, 602, duration=2)
    pyautogui.click()
    time.sleep(3)

    # === Вводим пароль ===
    pyautogui.moveTo(485, 465, duration=2)
    pyautogui.click()
    pyautogui.write('marikyand20', interval=0.12)
    time.sleep(1)

    # === Клик Sign In ===
    pyautogui.moveTo(640, 615, duration=2)
    pyautogui.click()
    print("[INFO] PyAutoGUI: логин завершён!")
    time.sleep(2)

    # === Клик Search ===
    pyautogui.moveTo(1026, 156, duration=2)
    pyautogui.click()
    print("[INFO] PyAutoGUI: click on search!")
    time.sleep(1)

    # === Type search (без клика, только навели и пишем + Enter) ===
    pyautogui.moveTo(873, 227, duration=1)
    pyautogui.click()
    print("[INFO] PyAutoGUI: Навели на поле поиска.")
    pyautogui.write('telegram', interval=0.12)
    pyautogui.press('enter')
    print("[INFO] PyAutoGUI: Текст введён, Enter нажат.")
    time.sleep(1)

if __name__ == "__main__":
    start_chrome()
    login_with_pyautogui()
    print("[INFO] Дай Cloudflare 15-30 сек на обход (или реши капчу руками при необходимости)...")
    time.sleep(25)  # Дай время пройти антибот (можно увеличить!)
    print("[INFO] Запускаем Puppeteer для сбора заказов...")
    subprocess.run([
        "node",
        PUPPETEER_SCRIPT,
        "python",      # <-- здесь тема поиска (можно менять)
        "100"               # <-- здесь минимальный бюджет (можно менять)
    ])
