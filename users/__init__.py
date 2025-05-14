from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin

db = SQLAlchemy()

class User(db.Model, UserMixin):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(150), nullable=False)

class AutoParseConfig(db.Model):
    __tablename__ = 'auto_parse_config'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    category = db.Column(db.String(100))
    keywords = db.Column(db.String(100))
    project_type = db.Column(db.String(50))
    region = db.Column(db.String(50))
    min_price = db.Column(db.Float)
    max_price = db.Column(db.Float)
    experience_level = db.Column(db.String(50))
    duration = db.Column(db.String(50))
    posted_date = db.Column(db.String(50))

class Job(db.Model):
    __tablename__ = 'job'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255))
    description = db.Column(db.Text)
    budget = db.Column(db.String(50))
    link = db.Column(db.String(500), unique=True, nullable=False)
    status = db.Column(db.String(50))
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)