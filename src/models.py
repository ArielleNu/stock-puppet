from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

# Define Episode model
class Episode(db.Model):
    __tablename__ = 'episodes'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(64), nullable=False)
    descr = db.Column(db.String(1024), nullable=False)
    
    def __repr__(self):
        return f'Episode {self.id}: {self.title}'

# Define Review model
class Review(db.Model):
    __tablename__ = 'reviews'
    id = db.Column(db.Integer, primary_key=True)
    imdb_rating = db.Column(db.Float, nullable=False)
    
    def __repr__(self):
        return f'Review {self.id}: {self.imdb_rating}'
    
#Define company model
class Company(db.Model):
    __tablename__ = 'companies'
    ticker = db.Column(db.String(10), primary_key=True)
    name = db.Column(db.String(256), nullable=False)
    sector = db.Column(db.String(128), nullable=True)
    industry = db.Column(db.String(256), nullable=True)
    market_cap = db.Column(db.Float, nullable=True)
    dividend_yield = db.Column(db.Float, nullable=True)
    description = db.Column(db.Text, nullable=True)
    city = db.Column(db.String(128), nullable=True)
    state = db.Column(db.String(64), nullable=True)
    country = db.Column(db.String(64), nullable=True)
    website = db.Column(db.String(256), nullable=True)

    def __repr__(self):
        return f'<Company {self.ticker}: {self.name}>'

    def to_dict(self):
        return {
            'ticker': self.ticker,
            'name': self.name,
            'sector': self.sector,
            'industry': self.industry,
            'market_cap': self.market_cap,
            'dividend_yield': self.dividend_yield,
            'description': self.description,
            'city': self.city,
            'state': self.state,
            'country': self.country,
            'website': self.website
        }
