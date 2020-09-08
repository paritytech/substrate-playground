import test from "ava";
import { Discoverer, Instance, Responder } from '../src/connect';

test('discoverer', t => {
  const discoverer = new Discoverer(instance => {
  });
  const uuid = 'uuid';
  const responder = new Responder(uuid, (i) => {
  });
  responder.announce();

  return new Promise(function(resolve) {
      setTimeout(() => {
        t.is(true, discoverer.instances.has(uuid));
        resolve();
      }, 100);
  });
});

test('instance', t => {
  const uuid = 'uuid';
  const instance = new Instance(uuid);
  const responder = new Responder(uuid, (i) => {
    console.log(i)
  });
  instance.execute("aa");

  return new Promise(function(resolve) {
      setTimeout(() => {
       // t.is(true, discoverer.instances.has(uuid));
        resolve();
      }, 1000);
  });
});