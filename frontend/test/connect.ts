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

test('instance', async t => {
  const action = "some-action";
  const answer = {o: "answer"};
  const uuid = 'uuid';
  const instance = new Instance(uuid);
  const responder = new Responder(uuid, o => {
    responder.respond({type: "extension-answer", uuid: o.uuid, data: answer});
  });

  t.deepEqual(answer, await instance.execute(action));

  instance.close();
  responder.close();
});