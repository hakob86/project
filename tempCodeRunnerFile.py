@app.route('/search', methods=['POST'])
def search():
    query = request.form.get("query", "").strip()
    if not query:
        return jsonify({"error": "Пустой запрос"}), 400

    config = AutoParseConfig.query.first()
    if not config:
        config = AutoParseConfig(user_id=1)
        db.session.add(config)
        db.session.commit()

    def safe(attr):
        return getattr(config, attr, '') or ''

    category = safe('category')
    keywords = safe('keywords')
    project_type = safe('project_type')
    region = safe('region')
    min_budget = str(config.min_price or 0)
    max_budget = str(config.max_price or '')
    experience = safe('experience_level')
    duration = safe('duration')
    posted_date = safe('posted_date')

    parts = query.split()
    topic = " ".join(parts[:-1]) if parts and parts[-1].isdigit() else query
    if parts and parts[-1].isdigit():
        min_budget = parts[-1]

    basedir = os.path.abspath(os.path.dirname(__file__))
    base_path = os.path.join(basedir, "results")
    parser = JobParserManager(base_path, topic, min_budget, max_budget, region, category, keywords, project_type, experience, duration, posted_date)

    try:
        jobs = parser.run_all()
    except RuntimeError as e:
        logger.exception("Ошибка парсера")
        return jsonify({"error": str(e)}), 500

    filterer = JobFilter(min_budget)
    filtered_jobs = filterer.filter_jobs(jobs)

    saver = JobSaver(1)
    try:
        saver.save(filtered_jobs)
    except Exception as e:
        return jsonify({"error": "Ошибка сохранения данных"}), 500

    return redirect(url_for('index'))