from flask import Flask, request, render_template, redirect, jsonify

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/search', methods=['POST'])
def search():
    query = request.form.get('query', '')
    print("🔍 Искали:", query)
    return f"Результат поиска: {query}"

@app.route('/add', methods=['POST'])
def add():
    data = request.get_json()
    print("➕ Добавление:", data)
    return jsonify({"status": "ok"})
