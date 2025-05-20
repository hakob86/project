import os
import json
import subprocess
from threading import Thread
from flask import Flask, request, jsonify, render_template, redirect, url_for, session
from flask_migrate import Migrate
from users import db
from users.models import AutoParseConfig, Job
import logging
from flask import flash
import sys


app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Подключение базы и миграций
db.init_app(app)
migrate = Migrate(app, db)

class JobParserManager:
    def __init__(self, base_path, topic, min_budget, max_budget, region, category, keywords, project_type, experience, duration, posted_date):
        self.base_path = base_path
        self.topic = topic
        self.min_budget = min_budget
        self.max_budget = max_budget
        self.region = region
        self.category = category
        self.keywords = keywords
        self.project_type = project_type
        self.experience = experience
        self.duration = duration
        self.posted_date = posted_date

    def run_all(self):
        jobs = []
        try:
            def run_parser(script_name):
                script_path = os.path.join(os.path.dirname(__file__), "parsers", script_name)
                logger.info(f"▶️ Запуск парсера {script_name} c темой: {self.topic}")
                result = subprocess.run([
                    "node", script_path, self.topic, self.min_budget, self.max_budget, self.region,
                    self.category, self.keywords, self.project_type, self.experience, self.duration, self.posted_date
                ], capture_output=True, text=True)
                logger.info(f"ℹ️ STDOUT {script_name} → {result.stdout}")
                logger.error(f"⚠️ STDERR {script_name} → {result.stderr}")

            upwork_thread = Thread(target=run_parser, args=("puppeteer_upwork.js",))
            guru_thread = Thread(target=run_parser, args=("puppeteer_guru.js",))
            upwork_thread.start()
            guru_thread.start()
            upwork_thread.join()
            guru_thread.join()

            for fname in ["upwork.json", "guru.json"]:
                fpath = os.path.join(self.base_path, fname)
                if os.path.exists(fpath):
                    with open(fpath, encoding='utf-8') as f:
                        data = json.load(f)
                        logger.info(f"📥 Загружено {len(data)} задач из {fname}")
                        jobs.extend(data)
                else:
                    logger.warning(f"❌ Файл {fpath} не найден")
        except Exception as e:
            logger.exception("Ошибка при запуске парсеров")
            raise RuntimeError(f"Ошибка парсера: {str(e)}")
        return jobs

class JobFilter:
    def __init__(self, min_budget):
        self.min_budget = float(min_budget)
        self.stop_words = ["scam", "crypto", "adult"]
        self.links_seen = set()

    def is_relevant(self, job):
        keywords = ["бот", "автоматизация", "scraper", "parser"]
        return any(word in job.get("description", "").lower() for word in keywords)

    def extract_budget(self, job):
        try:
            if isinstance(job.get("budget"), (int, float)):
                return float(job["budget"])
            text = job.get("budget") or job.get("description", "")
            for token in text.split():
                if token.replace("$", "").replace(",", "").isdigit():
                    return float(token.replace("$", "").replace(",", ""))
        except:
            pass
        return 0

    def filter_jobs(self, jobs):
        filtered = []
        for job in jobs:
            if not job.get("description") or not job.get("link"):
                continue
            if job.get("link") in self.links_seen:
                continue
            self.links_seen.add(job.get("link"))
            if not job.get("client_payment_verified", True):
                continue
            if job.get("client_hires", 0) < 1:
                continue
            if job.get("client_proposals", 0) > 30:
                continue
            if any(word in job.get("description", "").lower() for word in self.stop_words):
                continue
            if not self.is_relevant(job):
                continue
            if self.extract_budget(job) < self.min_budget:
                continue
            filtered.append(job)
        logger.info(f"✅ После фильтрации осталось: {len(filtered)} задач")
        return filtered

class JobSaver:
    def __init__(self, user_id):
        self.user_id = user_id

    def save(self, jobs):
        for job in jobs:
            if not Job.query.filter_by(link=job['link']).first():
                new_job = Job(
                    title=job.get("title", "Без названия"),
                    description=job.get("description", ""),
                    budget=job.get("budget", ""),
                    link=job.get("link"),
                    status="new",
                    user_id=self.user_id
                )
                db.session.add(new_job)
        try:
            db.session.commit()
            logger.info("💾 Сохранено в базу данных")
        except Exception as e:
            db.session.rollback()
            logger.error(f"❌ Ошибка при сохранении в БД: {e}")
            raise

@app.route('/')
def index():
    jobs = Job.query.order_by(Job.id.desc()).limit(20).all()
    return render_template('index.html', jobs=jobs)

import threading
import subprocess
import os
import json
from flask import jsonify, render_template, request, flash, redirect, url_for

def run_parser(cmd, result_file, errors):
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1000)
        if result.stderr:
            errors.append(f"STDERR {cmd[1]}: {result.stderr}")
        if result.stdout:
            print(f"STDOUT {cmd[1]}: {result.stdout}")
    except Exception as e:
        errors.append(f"Ошибка запуска {cmd[1]}: {e}")

class ParserRunner:
    def __init__(self, parsers):
        self.parsers = parsers
        self.errors = []
        self.results = []

    def run_parser(self, cmd, result_file):
        try:
            # Здесь можно вставить subprocess или реальный вызов
            exit_code = os.system(" ".join(cmd))  # Лучше subprocess.Popen для реальных проектов!
            if exit_code != 0:
                self.errors.append(f"Ошибка запуска {' '.join(cmd)}")
                return

            result_path = os.path.join("results", result_file)
            if os.path.exists(result_path):
                with open(result_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        self.results.extend(data)
                    else:
                        self.errors.append(f"Файл {result_file} повреждён или пустой.")
            else:
                self.errors.append(f"Файл {result_file} не найден.")
        except Exception as e:
            self.errors.append(f"Ошибка {result_file}: {e}")

    def start(self, topic, min_budget, max_budget, region):
        threads = []
        for p in self.parsers:
            cmd = [
                "node",
                os.path.join("parsers", p["script"]),
                topic,
                str(min_budget),
                str(max_budget),
                region
            ]
            t = threading.Thread(target=self.run_parser, args=(cmd, p["result_file"]))
            threads.append(t)
            t.start()
        for t in threads:
            t.join()
        return self.results, self.errors

@app.route('/search', methods=['POST'])
def search():
    query = request.form.get("query", "").strip()
    if not query:
        flash("Пустой запрос!", "error")
        return redirect(url_for('index'))

    parts = query.split()
    topic = " ".join(parts[:-1]) if parts and parts[-1].isdigit() else query
    min_budget = parts[-1] if parts and parts[-1].isdigit() else "0"
    max_budget = "9999999"
    region = ""

    parsers = [
        {"script": "puppeteer_guru.js", "result_file": "guru.json", "type": "node"},
        {"script": "puppeteer_freelancer.js", "result_file": "freelancer.json", "type": "node"},
    ]
    upwork = {"script": "run_all.py", "result_file": "upwork.json", "type": "python"}

    jobs, errors = [], []

    # 1. Параллельно запускаем Guru и Freelancer
    procs = []
    for p in parsers:
        try:
            proc = subprocess.Popen([
                "node",
                os.path.join("parsers", p["script"]),
                topic,
                min_budget,
                max_budget,
                region
            ])
            procs.append((proc, p))
        except Exception as e:
            errors.append(f"Ошибка запуска {p['script']}: {e}")

    # 2. Дожидаемся завершения обоих
    for proc, p in procs:
        retcode = proc.wait()
        if retcode == 0:
            try:
                with open(os.path.join("results", p["result_file"]), "r", encoding="utf-8") as f:
                    jobs += json.load(f)
            except Exception as e:
                errors.append(f"Ошибка чтения {p['result_file']}: {e}")
        else:
            errors.append(f"Парсер {p['script']} завершился с ошибкой {retcode}")

    # 3. Запускаем Upwork отдельно после них
    try:
        subprocess.run([
            sys.executable,
            os.path.join("parsers", upwork["script"]),
            topic,
            min_budget,
            max_budget,
            region
        ], check=True)
        with open(os.path.join("results", upwork["result_file"]), "r", encoding="utf-8") as f:
            jobs += json.load(f)
    except Exception as e:
        errors.append(f"Ошибка при запуске {upwork['script']}: {e}")

    if errors:
        flash(" / ".join(errors), "error")
    elif not jobs:
        flash("Нет найденных заказов", "warning")

    return render_template("index.html", jobs=jobs)


@app.route('/results')
def results():
    jobs = session.pop('jobs', None)
    return render_template('index.html', jobs=jobs)

@app.route('/add', methods=['POST'])
def add():
    data = request.get_json()
    logger.info(f"➕ Добавление через /add: {data}")
    return jsonify({"status": "ok"})

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)
