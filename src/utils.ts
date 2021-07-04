import { BrowserContext, Browser } from 'playwright';
import * as fs from 'fs/promises';
import { groupBy, isEmpty, map, reduce, each, chunk, keys } from 'lodash';
import {
  IUserCredentials,
  IBrowserContextByUserCredentials,
  ISearchRawData,
  IUserCredentialsTypes,
  ISearchStringsByBrowserContexts,
  IGenerateSearchStringsBySearchRawData,
  IGenerateSearchStringsCompanyOrProductsBySearchRawData,
} from './types';
import { getStorageStateAfterFacebookLogin } from './facebook';
import { getStorageStateAfterInstagramLogin } from './instagram';
import { MAX_RANDOM_DELAY_TIME } from './constants';

export const getNameForStorageStateByUserCredential = (
  userCredential: IUserCredentials,
): string =>
  `storageStateFor[${userCredential.type}][${userCredential.username}].json`;

export const getKeyByUserCredential = (
  userCredential: IUserCredentials,
): string => `${userCredential.type}-${userCredential.username}`;

export const getBrowserContextWithLoggedInStoregeState = async (
  userCredential: IUserCredentials,
  browser: Browser,
): Promise<BrowserContext> => {
  const context = await browser.newContext();
  let storageState = '';

  try {
    storageState = await fs.readFile(
      getNameForStorageStateByUserCredential(userCredential),
      'utf-8',
    );
  } catch (e) {
    console.log(
      `No file ${getNameForStorageStateByUserCredential(userCredential)}`,
    );
  }

  if (storageState.length > 0) {
    // TODO: Add logic to check if context is still valid
    return await browser.newContext({ storageState: JSON.parse(storageState) });
  }

  if (userCredential.type === 'facebook') {
    storageState = await getStorageStateAfterFacebookLogin(
      userCredential,
      context,
    );
  } else if (userCredential.type === 'instagram') {
    storageState = await getStorageStateAfterInstagramLogin(
      userCredential,
      context,
    );
  } else {
    return context;
  }

  await fs.writeFile(
    getNameForStorageStateByUserCredential(userCredential),
    storageState,
    'utf-8',
  );

  return context;
};

export const getBrowserContextsByUserCredentialsKey = async (
  browser: Browser,
  userCredentials: IUserCredentials[],
): Promise<IBrowserContextByUserCredentials> => {
  const browserContexts = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    map(userCredentials, (userCredential) =>
      getBrowserContextWithLoggedInStoregeState(userCredential, browser),
    ),
  );

  const browserContextsByUserCredentials: IBrowserContextByUserCredentials =
    reduce(
      userCredentials,
      (memo: IBrowserContextByUserCredentials, item, i) => {
        memo[getKeyByUserCredential(item)] = browserContexts[i];
        return memo;
      },
      {},
    );

  return browserContextsByUserCredentials;
};

export const generateSearchStringsBySearchRawData = (
  searchRawData: ISearchRawData[],
): IGenerateSearchStringsBySearchRawData => {
  const result = reduce(
    searchRawData,
    (memo: IGenerateSearchStringsBySearchRawData, item) => {
      let firstSearchWords = [item.companyName];

      if (!isEmpty(item.productNames)) {
        firstSearchWords = map(
          item.productNames,
          (productName) => `${item.companyName} ${productName}`,
        );
      }

      each(firstSearchWords, (partOfSearch) =>
        each(item.incidentKeywords, (incidentKeyword) => {
          memo[`${partOfSearch} ${incidentKeyword}`] = {
            companyName: item.companyName,
            searchString: `${partOfSearch} ${incidentKeyword}`,
            searchOptions: item.searchOptions,
          };
        }),
      );

      return memo;
    },
    {},
  );

  return result;
};

export const generateSearchStringsCompanyOrProductsBySearchRawData = (
  searchRawData: ISearchRawData[],
): IGenerateSearchStringsCompanyOrProductsBySearchRawData => {
  const result = reduce(
    searchRawData,
    (memo: IGenerateSearchStringsCompanyOrProductsBySearchRawData, item) => {
      let firstSearchWords = [item.companyName];

      if (!isEmpty(item.productNames)) {
        firstSearchWords = [
          ...firstSearchWords,
          ...(item.productNames as string[]),
        ];
      }

      each(firstSearchWords, (searchString) => {
        memo[searchString] = {
          companyName: item.companyName,
          incidentKeywords: item.incidentKeywords,
          searchString: searchString,
          searchOptions: item.searchOptions,
        };
      });

      return memo;
    },
    {},
  );

  return result;
};

export const getTypeForBrowserContextByUserCredentialsKey = (
  key: string,
): IUserCredentialsTypes | undefined => {
  if (key.includes('facebook-')) {
    return 'facebook';
  }
  if (key.includes('instagram-')) {
    return 'instagram';
  }
};

export const getSearchStringsByBrowserContexts = (
  userCredentials: IUserCredentials[],
  searchStrings:
    | IGenerateSearchStringsBySearchRawData
    | IGenerateSearchStringsCompanyOrProductsBySearchRawData,
): ISearchStringsByBrowserContexts => {
  const groupedUserCredentialsByType = groupBy(userCredentials, 'type');
  const searchStringsKeys = keys(searchStrings);
  return reduce(
    groupedUserCredentialsByType,
    (memo: ISearchStringsByBrowserContexts, userCredentialsByType) => {
      const sizeOfParts = userCredentialsByType.length;
      const totalSize = searchStringsKeys.length;
      const searchStringsByChanks =
        sizeOfParts >= totalSize
          ? [searchStringsKeys]
          : chunk(searchStringsKeys, Math.ceil(totalSize / sizeOfParts));

      each(userCredentialsByType, (userCredentialByType, index) => {
        memo[getKeyByUserCredential(userCredentialByType)] =
          searchStringsByChanks[index];
      });

      return memo;
    },
    {},
  );
};

export const getRandomDelayTimeInSecound = (
  max = MAX_RANDOM_DELAY_TIME,
): number => Math.floor(Math.random() * max);
