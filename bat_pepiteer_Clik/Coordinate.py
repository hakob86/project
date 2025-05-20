import pyautogui
import time

print("Наведи мышку в нужное место, жди 5 секунды...")
time.sleep(3)
x, y = pyautogui.position()
print(f"Текущие координаты: {x}, {y}")
