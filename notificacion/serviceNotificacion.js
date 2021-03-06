const express = require('express');
const app = express();
const fs = require('fs');
const bodyParser = require('body-parser');
const {BadRequest, ConnectionRefused, Failure, ResourceAlreadyExistError, ResourceNotFound, RelatedResourceNotFound, APIError} = require('./Excepciones');
const {isNotUndefined} = require('./funcionesAuxiliares');
const {Notificador, ApiUnqfy} = require('./notificador');
require('dotenv').config();

const router = express.Router();

const port = process.env.NOTIFICATION_PORT || 8001;

function levantarNotificador(filename) {
  let notificador = new Notificador();
  if (fs.existsSync(filename)) {
    notificador = Notificador.load(filename);
  }
  console.log('Cargar');
  return notificador;
}

function guardarNotificador(notificador, filename) {
  notificador.save(filename);
  console.log('Salvando');
}


function validateParams(params, req) {
  return params.every(p => isNotUndefined(req.query[p]) || isNotUndefined(req.body[p]));
}

//funcion para validar datos que llegan.
function run(params, func) {
  return function (req, res) {
    if (validateParams(params, req)) {
      const notificador = levantarNotificador('notificador.json');
      func(notificador, req, res);
    } else {
      throw new BadRequest;
    }
  };
}


/**
 * Endpoints
 * */

function existArtist(artistId) {
  const unqfy = new ApiUnqfy();

  return unqfy.artistExist(artistId)
    .then(boolean => {
      if (!boolean) {
        throw new ResourceNotFound();
      }
    });

}

function enviarResultado(promise, res) {
  promise
    .then(result => res.json(result))
    .catch(err => res.send(err));

}

//POST /api/subscribe body = ["artistId","email"];
router.route('/subscribe').post(run(['artistId', 'email'], (notificador, req, res) => {

  const promise = existArtist(req.body.artistId).then(asd => {

    return notificador.subscribe(req.body.email, req.body.artistId);

  }).then(value => {
    guardarNotificador(notificador, 'notificador.json');
    return value;
  }
  );
  enviarResultado(promise, res);

}));

//POST /api/unsubscribe  body = ["artistId","email"];
router.route('/unsubscribe').post(run(['artistId', 'email'], (notificador, req, res) => {

  const promise = existArtist(req.body.artistId).then(bool => {
    return notificador.unsubscribe(req.body.artistId, req.body.email);

  }).then(value => {

    guardarNotificador(notificador, 'notificador.json');
    return value;
  });

  enviarResultado(promise, res);
}));

//POST /api/notify
// "artistId": 0
// "subject": "Nuevo Album para artsta Chano",
// "message": "Se ha agregado el album XXX al artista Chano",

// "from": "UNQfy <UNQfy.notifications@gmail.com>",
router.route('/notify').post(run(['artistId', 'subject', 'message', 'from'], (notificador, req, res) => {

  const promise = existArtist(req.body.artistId).then(
    notificador.notify(req.body.artistId, req.body.subject, req.body.message, req.body.from)
  ).then(value => {
    guardarNotificador(notificador, 'notificador.json');
    return value;
  });
  enviarResultado(promise, res);

}));

//GET /api/subscriptions/id
// "subscriptors": [<email1>, <email2>]
router.route('/subscriptions/:id').get(run([], (notificador, req, res) => {

  const promise = existArtist(req.params.id).then(bool => {
    return notificador.subscriptions(req.params.id);
  });

  enviarResultado(promise, res);

}));

//GET /api/all

router.route('/all').get(run([], (notificador, req, res) => {


  res.json(notificador.artists);


}));

//DELETE /api/subscriptions body "artistId": <artistID>,
router.route('/subscriptions').delete(run(['artistId'], (notificador, req, res) => {

  const promise = existArtist(req.body.artistId).then(
    notificador.removeArtist(req.body.artistId)
  ).then(value => {
    guardarNotificador(notificador, 'notificador.json');
    return value;
  }
  );
  enviarResultado(promise, res);

}));


function throwException(res, e) {
  res.status(e.status).send(e);
}

function errorHandler(err, req, res, next) {
  console.error(err.name);
  if (err instanceof APIError) {
    res.status(err.status);
    res.json(err);
  } else if (err.type === 'entity.parse.failed') {
    res.status(err.status);
    res.json(new BadRequest());
  } else if (err.code === 'ECONNREFUSED') {
    throw new ConnectionRefused();
  } else {
    next(err);
  }
}


router.use('/', (req, res) => {
  throwException(res, new ResourceNotFound);
});

app.use(bodyParser.json());
app.use('/api', router);
app.use(errorHandler);
app.listen(port);

console.log('Server started at the port: ' + port);

