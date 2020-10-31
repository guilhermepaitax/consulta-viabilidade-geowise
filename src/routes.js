const express = require('express');

const ViabilityController = require('./controller/ViabilityController')

const routes = express.Router();

routes.post('/viabilidade', ViabilityController.index);

module.exports = routes;
