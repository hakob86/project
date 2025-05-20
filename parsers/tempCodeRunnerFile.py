
    time.sleep(1)

    pyautogui.moveTo(504, 605, duration=2)
    pyautogui.click()
    time.sleep(1)

    pyautogui.moveTo(485, 465, duration=2)
    pyautogui.click()
    pyautogui.write('marikyand20', interval=0.12)
    time.sleep(1)

    pyautogui.moveTo(640, 615, duration=2)
    pyautogui.click()
    print("[INFO] PyAutoGUI: логин завершён!")
    time.sleep(10)


    pyautogui.moveTo(503, 85, duration=2)
    pyautogui.click()
    print("[INFO] PyAutoGUI: Навели на поле поиска.")
    pyautogui.write("upwork", interval=0.12)
    pyautogui.press('enter')
    print("[INFO] PyAutoGUI: Текст введён, Enter нажат.")
    time.sleep(5)

    pyautogui.moveTo(1026, 156, duration=2)
    pyautogui.click()
    print("[INFO] PyAutoGUI: click on search!")
    time.sleep(1)

    pyautogui.moveTo(873, 227, duration=2)
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
