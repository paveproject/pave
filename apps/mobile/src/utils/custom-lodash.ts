import { upperFirst, words } from 'lodash';

const startCase = (string: string, wordPattern: RegExp) =>
  words(`${string}`.replace(/['\u2019]/g, ''), wordPattern).reduce(
    (result, word, index) => result + (index ? ' ' : '') + upperFirst(word),
    '',
  );

const title = (string: string) => {
  return startCase(string, /[^ ]+/g);
};

export { startCase, title };
