# Only needed for hosts that run WSGI apps (e.g. PythonAnywhere free tier).
# It wraps the FastAPI (ASGI) app so a WSGI server can run it.
from a2wsgi import ASGIMiddleware
from main import app

application = ASGIMiddleware(app)
