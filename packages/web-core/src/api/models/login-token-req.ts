/* tslint:disable */
/* eslint-disable */
/**
 * Corbado Frontend API
 * Overview of all Corbado Frontend API calls to implement passwordless authentication.
 *
 * The version of the OpenAPI document: 1.0.0
 * Contact: support@corbado.com
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */



/**
 * 
 * @export
 * @interface LoginTokenReq
 */
export interface LoginTokenReq {
    /**
     * 
     * @type {string}
     * @memberof LoginTokenReq
     */
    'token': string;
    /**
     * Unique ID of request, you can provide your own while making the request, if not the ID will be randomly generated on server side
     * @type {string}
     * @memberof LoginTokenReq
     */
    'requestID'?: string;
}

