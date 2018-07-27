/*
  The Listing Manager has the following responsibilities:

  * fulfillNewOrders() - Poll the OpenBazaar (OB) store for new orders and
  fulfill those orders when they are detected.

  * checkRentedDevices() - Monitor Clients that are actively being rented. Reboot
  them and generate a pro-rated refund if the device loses connection with the server.

  * checkListedDevices() - Monitor Clients with listings in the OB store.
  Reboot them if they lose connection with the server, by manipulating the
  expiration date.

  ---WIP---
  * Poll the OB store for purchases of renewal listings and increment the
  expiration date of the Client.

  * Monitor renewal listings and remove any that are unpaid after 1 hr.

  * Remove any orphaned obContract models that have reached their expiration.

*/

"use strict";

// Dependencies.
const express = require("express");
const util = require("./lib/util.js");
//const openbazaar = require("./lib/openbazaar.js");
const openbazaar = require("openbazaar-node");

// Global Variables
const app = express();
const port = 3434;

// Timer intervals.
const CHECK_OB_NOTIFICATIONS_INTERVAL = 2 * 60000; // 2 minutes
const CHECK_RENTED_DEVICES_INTERVAL = 5 * 60000; // 5 minutes
const CHECK_LISTED_DEVICES_INTERVAL = 5 * 60000; // 5 minutes

// Amount of time (mS) a device can go without checking in.
const MAX_DELAY = 60000 * 10; // 10 minutes.
//const MAX_DELAY = 60000 * 4;

// Time to wait for client to voluntarily re-register.
const BUFFER = 60000 * 5;
//const BUFFER = 60000 * 3;

// OpenBazaar Credentials
const OB_USERNAME = "yourUsername";
const OB_PASSWORD = "yourPassword";

// Server Information
const SERVER_URL = "http://serverdeployment2_p2pvps-server_1";
const SERVER_PORT = "5000";
//const SERVER_URL = "http://p2pvps.net";
//const SERVER_PORT = "80";

const OB_SERVER = "http://serverdeployment2_openbazaar_1";
const OB_SERVER_PORT = "4002"; // Open Bazaar port

// Create an Express server. Future development will allow serving of webpages and creation of Client API.
const ExpressServer = require("./lib/express-server.js");
const expressServer = new ExpressServer(app, port);
expressServer.start();

// Initialize the debugging logger.
const Logger = require("./lib/logger.js");
const logr = new Logger();

// Generate api credentials for OpenBazaar.
let config = {
  // Config object passed to library functions.
  server: SERVER_URL,
  port: SERVER_PORT,
  obServer: OB_SERVER,
  obPort: OB_SERVER_PORT,
  logr: logr, // Include a handle to the debug logger.
  clientId: OB_USERNAME,
  clientSecret: OB_PASSWORD,
  adminUser: "system",
  adminPass: "",
  jwt: "",
  isRenewal: false,
};
const apiCredentials = openbazaar.getOBAuth(config);
config.apiCredentials = apiCredentials;
//console.log(`apiCredentials: ${apiCredentials}`);

// Log into the P2P VPS API.
async function loginAdmin() {
  try {
    // Give the P2P VPS server time to start, before making the login call.
    await util.sleep(10000);

    // Retrieve the login credentials from the json file.
    const adminData = await util.readAdminFile();
    //console.log(`adminData: ${JSON.stringify(adminData, null, 2)}`);

    config.adminPass = adminData.password;

    // Log in as the admin and get the JWT token.
    config.jwt = await util.getToken(config);
  } catch (err) {
    console.error(`Error in loginAdmin(): `, err);
    await util.sleep(10000);
    loginAdmin();
  }
}
loginAdmin();

//async function waitForLogin() {
//  console.log(`Waiting for login...`);
//  do await util.sleep(1000);
//  while (config.jwt === "");
//}
//waitForLogin();

// Poll the OpenBazaar (OB) store for new orders and fulfill those orders when
// they are detected.
async function fulfillNewOrders() {
  try {
    const now = new Date();
    logr.info(`Listing Manager checking for new orders at ${now}`);

    // Get NEW notifications.
    const notes = await util.getNewOBNotifications(config);
    //console.log(`notes: ${JSON.stringify(notes, null, 2)}`);
    if (notes.length === 0) console.log(`No new notes found.`);

    // For now, assuming I have one order at a time.
    const thisNotice = notes[0];

    // Exit if no notices were found.
    if (thisNotice === undefined) return null;

    // Exit if the notice is not for an order.
    if (thisNotice.notification.type !== "order") {
      logr.debug("Notification returned was not an order. Exiting.");
      //console.log(`thisNotice: ${JSON.stringify(thisNotice, null, 2)}`);
      return null;
    }
    //logr.debug(`Order recieved: ${JSON.stringify(thisNotice, null, 2)}`);

    //const obOrderId = thisNotice.notification.orderId;

    // Get the listing details from the orderId.
    //const listing = await util.getListingFromOrder(config, obOrderId);

    // Get device ID from the listing
    //const slug = listing.contract.vendorOrderFulfillment[0].slug;
    //const tmp = slug.split("-");
    //const deviceId = tmp[tmp.length - 1];

    console.log(`Fulfilling order for ${thisNotice.notification.slug}`);
    const tmp = thisNotice.notification.slug.split("-");
    const deviceId = tmp[tmp.length - 1];

    // Determine if this is a renewal or not.
    const isRenewal = thisNotice.notification.slug.indexOf("renewal");
    if (isRenewal > -1) config.isRenewal = true;
    else config.isRenewal = false;

    // Exit if no device ID was returned.
    if (deviceId == null) {
      console.log(`deviceId is null`);
      return null;
    }
    // TODO need some better validation here to detect if a valid GUID was returned.

    // Get devicePublicModel from the server.
    let devicePublicModel = await util.getDevicePublicModel(config, deviceId);
    //console.log(`Got device public model: ${devicePublicModel._id.toString()}`);
    //console.log(`Got device public model: ${JSON.stringify(devicePublicModel, null, 2)}`);

    // Return the ID for the devicePrivateModel
    const privateId = devicePublicModel.privateData;

    // Get the devicePrivateModel
    const devicePrivateModel = await util.getDevicePrivateModel(config, privateId);
    //console.log(`devicePrivateModel: ${JSON.stringify(devicePrivateModel, null, 2)}`);

    // TODO need better validation. Should roll that into the util.getDevicePrivateModel().
    if (!devicePrivateModel) {
      console.log(`Could not find devicePrivateData model!`);
      return null;
    }
    //console.log(`Got devicePrivateData model: ${devicePrivateModel._id.toString()}`);

    // Note, expiration date is auotmatically updated in the next promise.

    config.devicePrivateData = devicePrivateModel;
    config.obNotice = thisNotice;

    // Mark the order as fulfilled.
    await util.fulfillOBOrder(config);

    if (thisNotice === undefined) return null;

    config.obNotice = thisNotice;

    // Mark notification as read.
    await util.markNotificationAsRead(config);

    // Update the expiration date.
    devicePublicModel = await util.updateExpiration(config, devicePublicModel._id, 30);
    if (!devicePublicModel) throw { message: `Error updating device expiration!` };

    // Add the device to the Rented Devices list.
    await util.addRentedDevice(config, devicePublicModel._id);

    // Remove the listing from the OB store and the obContract model from the server.
    await util.removeOBListing(config, devicePublicModel);

    // Add a payment object to the payments array.
    await util.addPaymentObject(config);

    console.log(`OB listing for ${devicePublicModel._id} successfully removed.`);

    resetConfig(); // Reset the config object for next iteration.
  } catch (err) {
    if (err.statusCode >= 500) {
      console.error(
        `There was an issue with finding the listing on the OpenBazaar server. Skipping.`
      );
    } else {
      logr.error(`Error in listing-manager.js/fulfillNewOrders(): ${err}`);
      logr.error(`Error stringified: ${JSON.stringify(err, null, 2)}`);
      //throw err;
    }
  }
}

// Call checkNotifications() every 2 minutees.
//const notificationTimer = setInterval(function() {
setInterval(function() {
  fulfillNewOrders();
}, CHECK_OB_NOTIFICATIONS_INTERVAL);
//fulfillNewOrders();

// Check all rented devices to ensure their connection is active.
async function checkRentedDevices() {
  //debugger;

  try {
    // Get a list of rented devices from the server.
    const rentedDevices = await util.getRentedDevices(config);

    for (let i = 0; i < rentedDevices.length; i++) {
      const thisDeviceId = rentedDevices[i];

      // Get the devicePublicModel for this device.
      const publicData = await util.getDevicePublicModel(config, thisDeviceId);

      // Calculate the delay since the client last checked in.
      const checkinTimeStamp = new Date(publicData.checkinTimeStamp);
      const now = new Date();
      const delay = now.getTime() - checkinTimeStamp.getTime();

      // If device has taken too long to check in.
      if (delay > MAX_DELAY) {
        //debugger;

        // Set the device expiration to now.
        await util.updateExpiration(config, thisDeviceId, 0);

        // Remove the deviceId from the rentedDevices model on the server.
        await util.removeRentedDevice(config, thisDeviceId);

        logr.log(
          `Device ${thisDeviceId} has been removed from the rented devices list due to inactivity.`
        );
      }
    }

    return true;
  } catch (err) {
    debugger;
    logr.error(`Error in listing-manager.js/checkRentedDevices(): ${err}`);

    if (err.statusCode >= 500) {
      logr.error(
        "listing-manager.js/checkRentedDevices(): Connection to the server was refused. Will try again."
      );
    } else if (err.statusCode === 404) {
      logr.error("Server returned 404. Is the server running?");
    } else {
      logr.error(`Error stringified: ${JSON.stringify(err, null, 2)}`);
    }
  }
}
//checkRentedDevices(); // Call the function immediately.

// Call checkRentedDevices() every 2 minutees.
//const checkRentedDevicesTimer = setInterval(function() {
setInterval(function() {
  checkRentedDevices();
}, CHECK_RENTED_DEVICES_INTERVAL);

// Check all listings in the OB market to ensure their connection is active.
async function checkListedDevices() {
  //debugger;

  try {
    const listings = await openbazaar.getListings(config);

    for (let i = 0; i < listings.length; i++) {
      // Get device ID from listing slug
      const thisSlug = listings[i].slug;
      const tmp = thisSlug.split("-");
      const thisDeviceId = tmp[tmp.length - 1];
      logr.debug(`checkListedDevices() reviewing this deviceId: ${thisDeviceId}`);

      const isValid = util.validateGuid(thisDeviceId);
      //logr.debug(`GUID validator function returned ${isValid}`);
      if (!isValid) continue;

      // Get the devicePublicModel for the current listing.
      let publicData;
      try {
        publicData = await util.getDevicePublicModel(config, thisDeviceId);
      } catch (err) {
        // User deleted device. Remove listing.
        if (err.statusCode === 404) {
          // Remove the listing from the OB store.
          //await util.removeOBListing(config, publicData);

          // Delete the actual OB listing.
          await openbazaar.removeListing(config, thisSlug);

          logr.log(
            `OB listing for ${thisDeviceId} has been removed because model could not be found on server.`
          );
          return true;
        }
        throw err;
      }

      // Calculate the delay since the client last checked in.
      const checkinTimeStamp = new Date(publicData.checkinTimeStamp);
      const now = new Date();
      const delay = now.getTime() - checkinTimeStamp.getTime();

      // If device has taken too long to check in, remove the listing.
      if (delay > MAX_DELAY) {
        debugger;

        logr.log(`delay: ${delay}, MAX_DELAY: ${MAX_DELAY}`);

        // Set the device expiration to now, to force a reboot when it comes online.
        await util.updateExpiration(config, thisDeviceId, 0);

        // Remove the listing from the OB store.
        await util.removeOBListing(config, publicData);

        logr.log(`OB listing for ${thisDeviceId} has been removed due to inactivity.`);
        return true;
      }

      // If the device expiration date has been reached, remove the listing.
      const expiration = new Date(publicData.expiration);
      if (expiration.getTime() + BUFFER < now.getTime()) {
        debugger;

        // Remove the listing from the OB store.
        await util.removeOBListing(config, publicData);

        logr.log(`OB listing for ${thisDeviceId} has been removed due to expiration date reached.`);
        return true;
      }

      // If the store listing experation has been reached, remove the listing.
      const obContractId = publicData.obContract;
      const obContractModel = await util.getObContractModel(config, obContractId);

      if (obContractModel) {
        //logr.debug(`obContractModel: ${JSON.stringify(obContractModel, null, 2)}`);
        const experation = new Date(obContractModel.experation);
        if (now.getTime() > experation.getTime()) {
          // Remove the listing from the OB store.
          await util.removeOBListing(config, publicData);

          logr.log(
            `OB listing for ${thisDeviceId} has been removed due to expiration date reached.`
          );
        }
      }
    }

    return true;
  } catch (err) {
    debugger;

    logr.error(`Error in listing-manager.js/checkListedDevices(): ${err}`);

    if (err.statusCode >= 500) {
      logr.error(
        "listing-manager.js/checkListedDevices(): Connection to the server was refused. Will try again."
      );
    } else if (err.statusCode === 404) {
      logr.error("Server returned 404. Is the server running?");
    } else if (err.name === "RequestError") {
      logr.error("Server connection was reset. Will try again.");
    } else if (err === "database error") {
      logr.error("Database error. Skipping.");
    } else {
      logr.error(`Error stringified: ${JSON.stringify(err, null, 2)}`);
    }
  }
}
//checkListedDevices(); // Call the function immediately.

// Call checkRentedDevices() every 2 minutees.
//const checkListedDevicesTimer = setInterval(function() {
setInterval(function() {
  checkListedDevices();
}, CHECK_LISTED_DEVICES_INTERVAL);

// Reset the global config variable.
function resetConfig() {
  config = {
    // Config object passed to library functions.
    apiCredentials: apiCredentials,
    server: SERVER_URL,
    port: SERVER_PORT,
    obServer: OB_SERVER,
    obPort: OB_SERVER_PORT,
    logr: logr, // Include a handle to the debug logger.
    adminUser: "system",
    adminPass: config.adminPass,
    jwt: config.jwt,
    isRenewal: false,
  };
}
