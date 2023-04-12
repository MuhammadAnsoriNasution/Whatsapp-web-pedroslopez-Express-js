const listNUmber = [

];

function sendMessage(requestParams, ctx, ee, next) {
  let ack = Math.floor(Math.random() * 10);
  ctx.vars["number"] = listNUmber[ack];
  ctx.vars[
    "message"
  ] = `halo ${listNUmber[ack]} anda berhak mendapatkan pinjol dari kami dengan jaminan ginjal`;

  return next();
}

module.exports = {
  sendMessage,
};
