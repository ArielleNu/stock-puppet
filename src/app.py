import json
import os
from dotenv import load_dotenv
from flask import Flask

load_dotenv()
from flask_cors import CORS
from models import db, Episode, Review, Company
from routes import register_routes

# src/ directory and project root (one level up)
current_directory = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_directory)

# Serve React build files from <project_root>/frontend/dist
app = Flask(__name__,
    static_folder=os.path.join(project_root, 'frontend', 'dist'),
    static_url_path='')
CORS(app)

# Configure SQLite database - using 3 slashes for relative path
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///data.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize database with app
db.init_app(app)

# Register routes
register_routes(app)

# Initialize database from local seed files.
def init_db():
    with app.app_context():
        # Create tables if they don't exist
        db.create_all()
        
        # Initialize database with data from init.json if empty
        if Episode.query.count() == 0:
            json_file_path = os.path.join(current_directory, 'init.json')
            with open(json_file_path, 'r') as file:
                data = json.load(file)
                for episode_data in data['episodes']:
                    episode = Episode(
                        id=episode_data['id'],
                        title=episode_data['title'],
                        descr=episode_data['descr']
                    )
                    db.session.add(episode)
                
                for review_data in data['reviews']:
                    review = Review(
                        id=review_data['id'],
                        imdb_rating=review_data['imdb_rating']
                    )
                    db.session.add(review)
            
            db.session.commit()
            print("Database initialized with episodes and reviews data")

        # Initialize companies table from src/data/company-data.json if present.
        company_data_json = os.path.join(current_directory, "data", "company-data.json")
        if Company.query.count() == 0 and os.path.exists(company_data_json):
            added = 0
            with open(company_data_json, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    for row in data:
                        if not isinstance(row, dict):
                            continue
                        symbol = (row.get("symbol") or "").strip().upper()
                        if not symbol:
                            continue
                        name = row.get("companyName") or row.get("name") or symbol
                        company = Company(
                            ticker=symbol,
                            name=name,
                            sector=row.get("sector"),
                            industry=row.get("industry"),
                            market_cap_fmp=row.get("mktCap"),
                            description=row.get("description"),
                            city=row.get("city"),
                            state=row.get("state"),
                            country=row.get("country"),
                            website=row.get("website"),
                            source_json=json.dumps({"source_file": "company-data.json"}),
                        )
                        db.session.add(company)
                        added += 1
            db.session.commit()
            print(f"Database initialized with {added} companies from company-data.json")

init_db()

if __name__ == '__main__':
    app.run(debug=True, host="0.0.0.0", port=5001)
