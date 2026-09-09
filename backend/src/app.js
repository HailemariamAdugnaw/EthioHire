const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const routes = require('./routes');
const { errorMiddleware } = require('./middleware/errorMiddleware');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));
app.use('/api', routes);
app.use(errorMiddleware);

module.exports = app;
