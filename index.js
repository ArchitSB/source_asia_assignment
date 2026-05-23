const express = require('express');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/docs/swagger');
const part1Router = require('./src/routes/part1.routes');
const part2Router = require('./src/routes/part2.routes');
const { validateJson, globalErrorHandler } = require('./src/middleware/validate');

const app = express();
const PORT = 3000;

// Production note: helmet and cors middleware would be added here
// e.g. app.use(helmet()); app.use(cors({ origin: process.env.ALLOWED_ORIGINS }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use(express.json());

app.use('/', part1Router);
app.use('/products', part2Router);

app.use(validateJson);

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} does not exist`,
  });
});

app.use(globalErrorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
