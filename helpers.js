require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sanitize = require('sanitize-filename');

module.exports = {
     PullPlayerData: PullPlayerData,
     PushPlayerData: PushPlayerData,
     NotifyPlayer: NotifyPlayer
}

function PullPlayerData(id) {
     try {
          let id_clean = sanitize(id.toString());
          var data = JSON.parse(fs.readFileSync(`../data/accounts/${id_clean}.json`));
          return data;
     } catch (exception) {
          console.error(exception);
          return null;
     }
}

function PushPlayerData(id, data) {
     data = JSON.stringify(data, null, "     ");
     let id_clean = sanitize(id.toString());
     fs.writeFileSync(`../data/accounts/${id_clean}.json`, data);
}

function NotifyPlayer(id, template, params) {
     if(!(Object.values(notificationTemplates).includes(template))) return false;
     var data = helpers.PullPlayerData(id);
     if(data == null) return false;

     const notification = {
          template: template,
          parameters: params
     }
     data.notifications.push(notification);

     helpers.PushPlayerData(id, data);
     return true;
}