import subprocess
import time
import pyautogui
import sys

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
USER_DATA_DIR = r"C:\DavUserChrome"
UPWORK_URL = "https://www.upwork.com/ab/account-security/login"
PUPPETEER_SCRIPT = r"C:\Users\Mane\Desktop\Python\project-main\parsers\puppeteer_upwork.js"

def start_chrome():
    subprocess.Popen([
        CHROME_PATH,
        "--remote-debugging-port=9223",
        f"--user-data-dir={USER_DATA_DIR}",
        UPWORK_URL
    ])
    print("[INFO] Открыл Chrome на странице Upwork Login")
    time.sleep(6)

def login_with_pyautogui(topic):
    print("[INFO] Запускаем PyAutoGUI для логина...")
    time.sleep(3)
    pyautogui.moveTo(782, 490, duration=2)
    pyautogui.click()
    pyautogui.write('davmarikyan@gmail.com', interval=0.12)
    time.sleep(1)

    pyautogui.moveTo(734, 552, duration=2)
    pyautogui.click()
    time.sleep(1)

    pyautogui.moveTo(632, 543, duration=2)
    pyautogui.click()
    pyautogui.write('marikyand20', interval=0.12)
    time.sleep(1)

    pyautogui.moveTo(643, 680, duration=2)
    pyautogui.click()
    print("[INFO] PyAutoGUI: логин завершён!")
    time.sleep(1)


    # pyautogui.moveTo(503, 85, duration=2)
    # pyautogui.click()
    # print("[INFO] PyAutoGUI: Навели на поле поиска.")
    # pyautogui.write("upwork", interval=0.12)
    # pyautogui.press('enter')
    # print("[INFO] PyAutoGUI: Текст введён, Enter нажат.")
    # time.sleep(5)

    pyautogui.moveTo(1003, 212, duration=2)
    pyautogui.click()
    print("[INFO] PyAutoGUI: click on search!")
    time.sleep(1)

    pyautogui.moveTo(809, 300, duration=2)
    pyautogui.click()
    print("[INFO] PyAutoGUI: Навели на поле поиска.")
    pyautogui.write(topic, interval=0.12)
    pyautogui.press('enter')
    print("[INFO] PyAutoGUI: Текст введён, Enter нажат.")
    time.sleep(1)


if __name__ == "__main__":
    # Получаем аргументы из sys.argv (или по дефолту)
    topic = sys.argv[1] if len(sys.argv) > 1 else "python"
    min_budget = sys.argv[2] if len(sys.argv) > 2 else "100"

    start_chrome()
    login_with_pyautogui(topic)   # <-- передаём сюда topic!
    print("[INFO] Дай Cloudflare 15-30 сек на обход (или реши капчу руками при необходимости)...")
    time.sleep(25)
    print("[INFO] Запускаем Puppeteer для сбора заказов...")
    subprocess.run([
        "node",
        PUPPETEER_SCRIPT,
        topic,
        min_budget
    ])
