// Copyright 2017, Google, Inc.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const moment = require('moment');

function getModel () {
  return require(`./model-${require('../config').get('DATA_BACKEND')}`);
}


function getEntryKind (entry) {
  return `${entry.siteCd}-${entry.deviceCd}-${entry.usageType}-${entry.intervalType}`
}
function getStartOfDayEpoch (entry) {
  const date = moment.utc(entry.timestamp).format('YYYY-MM-DD')
  return moment.utc(date).valueOf()
}

const router = express.Router();

// Automatically parse request body as JSON
router.use(bodyParser.json());

/**
 * GET /api/books
 *
 * Retrieve a page of books (up to ten at a time).
 */
router.get('/', (req, res, next) => {
  getModel().list(10, req.query.pageToken, (err, entities, cursor) => {
    if (err) {
      next(err);
      return;
    }
    res.json({
      items: entities,
      nextPageToken: cursor
    });
  });
});

/**
 * POST /api/books
 *
 * Create a new book.
 */
router.post('/', (req, res, next) => {
  getModel().create(req.body, (err, entity) => {
    if (err) {
      next(err);
      return;
    }
    res.json(entity);
  });
});

/**
 * GET /api/books/:id
 *
 * Retrieve a book.
 */
router.get('/:book', (req, res, next) => {
  getModel().read(req.params.book, (err, entity) => {
    if (err) {
      next(err);
      return;
    }
    res.json(entity);
  });
});

/**
 * PUT /api/books/:id
 *
 * Update a book.
 */
router.put('/:book', (req, res, next) => {
  getModel().update(req.params.book, req.body, (err, entity) => {
    if (err) {
      next(err);
      return;
    }
    res.json(entity);
  });
});

/**
 * DELETE /api/books/:id
 *
 * Delete a book.
 */
router.delete('/:book', (req, res, next) => {
  getModel().delete(req.params.book, (err) => {
    if (err) {
      next(err);
      return;
    }
    res.status(200).send('OK');
  });
});

//Telemetry Push Subscription Web hook
router.post('/_ah/push-handlers/time-series/telemetry', (req, res, next) => {
  const reqBody = req && req.body;
  const entryData = reqBody &&
    reqBody.message &&
    reqBody.message.data;
  let decodedData;
  let dataObj;
  let entry;

  // console.log("reqBody: ", reqBody)
  // console.log("entryData: ", entryData)

  if (entryData) {
    decodedData = Buffer.from(entryData, 'base64');
    dataObj = JSON.parse(decodedData.toString());

    // TODO: create a key from the siteCd, deviceCd, usageType and dateRange, 

    //TODO: update
    // entry = Object.assign({}, reqBody.attributes, {createdAt: Date.now()})
    console.log("reqBody: ", reqBody);
    console.log("Object.keys(reqBody): ", Object.keys(reqBody));
    console.log("reqBody.attributes: ", reqBody.attributes);
    console.log("reqBody.attributes.siteCd: ", reqBody.attributes && reqBody.attributes.siteCd);
    const entries = dataObj && dataObj.usages.map(usage => {
      return {
        ...usage, //includes intervalType, usageType, timestamp, and value
        siteCd: reqBody.attributes && reqBody.attributes.siteCd,
        gatewayCd: reqBody.attributes && reqBody.attributes.gatewayCd,
      }
    })
    // .filter(entry => getEntryKind(entry))
    .forEach(entry => {
      //find existing entry
      //NOTE: first arg is id - but note: need to have different key for each device and usage type

      console.log("entry: ", entry, ", getEntryKind(entry): ", getEntryKind(entry), ", getStartOfDayEpoch(entry): ", getStartOfDayEpoch(entry))
      let nextEntry
      getModel().read(getEntryKind(entry), getStartOfDayEpoch(entry), (err, existingEntry) => {
        // if (err) {
        //   next(err);
        //   return;
        // }
        // res.json(entity);

        // console.log("getEntryKind(entry): ", getEntryKind(entry), ", getStartOfDayEpoch(entry): ", getStartOfDayEpoch(entry), ", existingEntry: ", existingEntry)

        if (existingEntry) {
          nextEntry = {
            ...existingEntry,
            values: {
              [entry.timestamp]: entry.value
            }
          }
        } else {
          nextEntry = {
            ...entry,
            values: {
              [parseInt(entry.timestamp)]: entry.value
            }
          }

          delete nextEntry.value
        }

        // console.log("nextEntry: ", nextEntry);

        //TODO: save nextEntry
        getModel().update(getEntryKind(nextEntry), getStartOfDayEpoch(nextEntry), nextEntry, (err, updatedEntry) => {
          if (err) {
            next(err);
            return;
          }

          // console.log("returning response of nextEntry: ", nextEntry)
          // res.send(nextEntry);
          // res.json(nextEntry);
          // res.send();
          // res.status(200).send('OK');
        });
      });
    });

    //TODO: use the entry datetime 

    // console.log("---START---")
    // console.log("JSON.parse(decodedData.toString()) first usage!: ", dataObj.usages[0])
    // console.log("---END---")

    //TODO: first try to get the exisiting entry

    // getModel().create(entry, (err, entity) => {
    //   if (err) {
    //     next(err);
    //     return;
    //   }

    //   // console.log("saving entity: ", entity)

    //   res.json(entity);
    // });
    res.status(200).send('OK');
  } else {
    console.log("No dataObject was found!")
    
    res.status(204).send()
  }

  //TODO: loop through dataObj.usages, get resource, update with new data, and resave

  //NOTE: this needs to be updated
})

/**
 * Errors on "/api/books/*" routes.
 */
router.use((err, req, res, next) => {
  // Format error and forward to generic error handler for logging and
  // responding to the request
  err.response = {
    message: err.message,
    internalCode: err.code
  };
  next(err);
});

module.exports = router;
