'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const middleware = require('./chunks/middleware.cjs');
require('defu');
require('image-meta');
require('ufo');
require('fs');
require('pathe');
require('http');
require('https');
require('ohmyfetch');
require('destr');
require('etag');
require('xss');



exports.createIPX = middleware.createIPX;
exports.createIPXMiddleware = middleware.createIPXMiddleware;
exports.handleRequest = middleware.handleRequest;
