var extend = require('xtend'),
	request = require('request'),
	querystring = require('querystring'),
	BlueBird = require('bluebird'),
	PromiseRetryer = require('promise-retryer')(BlueBird),
	PromiseObject = require('promise-object')(BlueBird),
	debug = require('debug')('http'),
	colors = require('colors'),
	Joi = require('joi');

BlueBird.promisifyAll(Joi);

/**
 * CloudFlare v4 API Client
 */
var CloudFlare = PromiseObject.create({
	initialize: function ($config) {
		this._key = $config.key;
		this._email = $config.email;

		this._itemsPerPage = $config.itemsPerPage || 100;
		this._maxRetries = $config.maxRetries || 1;
		this._raw = $config.raw || false;
	},

	API_URL: 'https://api.cloudflare.com/client/v4',

	_request: function ($deferred, schema, payload, raw) {
		var hasQuery = !!(payload && payload.query),
			hasBody = !!(payload && payload.body);

		schema = schema || {};
		payload = payload || {};

		payload.raw = raw;

		if (hasQuery) {
			payload.query = extend({
				page: 1,
				per_page: this._itemsPerPage
			}, payload.query);
		}

		if (hasBody) {
			if (hasQuery && payload.body.per_page) {
				payload.query.per_page = payload.body.per_page;
				delete payload.body.per_page;
			}

			if (hasQuery && payload.body.page) {
				payload.query.page = payload.body.page;
				delete payload.body.page;
			}
		}

		schema.path = Joi.string().required();
		schema.callee = Joi.string().required();
		schema.required = Joi.string();
		schema.method = Joi.valid(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).required();
		schema.query = extend({
			per_page: Joi.number().min(1).max(100),
			page: Joi.number().min(1)
		}, schema.query);
		schema.raw = Joi.boolean();

		$deferred.resolve(this._validateAndMakeRequest(schema, payload));
	},

	_tryRequest: function($deferred, $self, $config) {
		$config.query = extend({}, $config.query);
		$config.body = extend({}, $config.body);

		var getURL = this.API_URL + '/' + $self._resolvePath($config.path, $config.params) + (Object.keys($config.query).length ? '?' + querystring.stringify($config.query) : ''); // Construct URL with parameters

		$deferred.resolve(PromiseRetryer.run({
			delay: function (attempt) {
				return attempt * 1000;
			},
			maxRetries: $self._maxRetries,
			onAttempt: function (attempt) {
				if (attempt === 1) {
					debug(('[doapi] ' + $config.method + ' "' + getURL + '"')[attempt > 1 ? 'red' : 'grey']);
				} else {
					debug(('[doapi attempt ' + attempt + '] ' + $config.method + ' "' + getURL + '"')[attempt > 1 ? 'red' : 'grey']);
				}
			},
			promise: function (attempt) {
				return new BlueBird(function (resolve, reject) {
					request(
						{
							method: $config.method,
							url: getURL,
							json: true,
							headers: {
								'X-Auth-Key': $self._key,
								'X-Auth-Email': $self._email
							},
							body: $config.body
						},
						function(error, response, body) {
							if (!error && body && (response.statusCode < 200 || response.statusCode > 299)) {
								var error = body.errors[0] || {};

								return reject(new Error(
									'\nAPI Error: ' + (error.code + ' - ' + error.message)
								));
							} else if (error) {
								return reject(new Error(
									'Request Failed: ' + error
								));
							} else if ($config.required && !body[$config.required]) {
								return reject(new Error(
									'\nAPI Error: Response was missing required field (' + $config.required + ')'
								));
							} else {
								if ($config.raw || $self._raw && $config.raw !== false) {
									resolve(body || {});
								} else if ($config.required) {
									resolve(body[$config.required] || {});
								} else {
									resolve(body || {});
								}
							}
						}
					);
				});
			}
		}));
	},

	_resolvePath: function (path, params) {
		return path.replace(/\:([a-z0-9_-]+)\b/gi, function (string, match) {
			return params.hasOwnProperty(match) ? params[match] : string;
		});
	},

	_validateAndMakeRequest: function ($deferred, $self, schema, payload) {
		Joi.validateAsync(payload, schema, {abortEarly: false})
			.then(function () {
				$deferred.resolve($self._tryRequest(payload));
			})
			.catch(function (error) {
				var errorMessage = ('CloudFlareApiError: validation error when calling "' + payload.callee + '"\n[' + payload.method + '] /' + $self._resolvePath(payload.path, payload.params) + '\n').red;

				errorMessage += error.annotate();

				$deferred.reject(errorMessage);
			});
	},

	
	/**
	 * Create billing profile for user
	 *
	 * https://api.cloudflare.com/#user-billing-profile-create-billing-profile
	 */
	userBillingProfileNew: function ($deferred, body, raw) {
		$deferred.resolve(this._request({
			body: {
				first_name: Joi.string().max(50).required(),
				last_name: Joi.string().max(90).required(),
				address: Joi.string().max(100).required(),
				city: Joi.string().max(80).required(),
				state: Joi.string().max(40).required(),
				zipcode: Joi.string().max(25).required(),
				country: Joi.string().max(50).required(),
				telephone: Joi.string().max(20).required(),
				card_number: Joi.string().max(19).required(),
				card_expiry_year: Joi.number().required(),
				card_expiry_month: Joi.number().required(),
				card_cvv: Joi.string().max(4).required(),

				address2: Joi.string().max(100),
				vat: Joi.string().max(255)
			}
		}, {
			callee: 'userBillingProfileNew',
			method: 'POST',
			path: 'user/billing/profile',
			required: 'result',
			body: body || {}
		}, raw));
	},

	/**
	 * Update billing profile for user
	 *
	 * https://api.cloudflare.com/#user-billing-profile-update-billing-profile
	 */
	userBillingProfileUpdate: function ($deferred, body, raw) {
		$deferred.resolve(this._request({
			body: {
				first_name: Joi.string().max(50).required(),
				last_name: Joi.string().max(90).required(),
				address: Joi.string().max(100).required(),
				city: Joi.string().max(80).required(),
				state: Joi.string().max(40).required(),
				zipcode: Joi.string().max(25).required(),
				country: Joi.string().max(50).required(),
				telephone: Joi.string().max(20).required(),
				card_number: Joi.string().max(19).required(),
				card_expiry_year: Joi.number().required(),
				card_expiry_month: Joi.number().required(),
				card_cvv: Joi.string().max(4).required(),

				address2: Joi.string().max(100),
				vat: Joi.string().max(255)
			}
		}, {
			callee: 'userBillingProfileUpdate',
			method: 'PUT',
			path: 'user/billing/profile',
			required: 'result',
			body: body || {}
		}, raw));
	},

	/**
	 * Update billing profile VAT for user
	 *
	 * https://api.cloudflare.com/#user-billing-profile-update-particular-elements-of-your-billing-profile
	 */
	userBillingProfileVATUpdate: function ($deferred, body, raw) {
		$deferred.resolve(this._request({
			body: {
				vat: Joi.string().max(255).required()
			}
		}, {
			callee: 'userBillingProfileVATUpdate',
			method: 'PATCH',
			path: 'user/billing/profile',
			required: 'result',
			body: body || {}
		}, raw));
	},

	/**
	 * Get billing profile for user
	 *
	 * https://api.cloudflare.com/#user-billing-profile-billing-profile
	 */
	userBillingProfileGet: function ($deferred, raw) {
		$deferred.resolve(this._request(null, {
			callee: 'userBillingProfileGet',
			method: 'GET',
			path: 'user/billing/profile',
			required: 'result'
		}, raw));
	},

	/**
	 * Delete billing profile for user
	 *
	 * https://api.cloudflare.com/#user-billing-profile-delete-billing-profile
	 */
	userBillingProfileDestroy: function ($deferred, raw) {
		$deferred.resolve(this._request(null, {
			callee: 'userBillingProfileDestroy',
			method: 'DELETE',
			path: 'user/billing/profile',
			required: 'result'
		}, raw));
	},

	/**
	 * Get billing history
	 *
	 * https://api.cloudflare.com/#user-billing-history-billing-history
	 */
	userBillingHistoryGetAll: function ($deferred, query, raw) {
		$deferred.resolve(this._request({
			query: {
				order: Joi.string().valid('type', 'occured_at', 'action'),
				type: Joi.string(),
				occured_at: Joi.string(),
				action: Joi.string()
			}
		}, {
			callee: 'userBillingHistoryGetAll',
			method: 'GET',
			path: 'user/billing/history',
			required: 'result',
			query: query || {}
		}, raw));
	},

	/**
	 * Get app subscriptions for user
	 *
	 * https://api.cloudflare.com/#app-subscription-list
	 * https://api.cloudflare.com/#app-subscription-search-sort-and-paginate
	 */
	userBillingSubscriptionsAppGetAll: function ($deferred, query, raw) {
		$deferred.resolve(this._request({
			query: {
				order: Joi.string().valid(
					'created_on',
					'expires_on',
					'activated_on',
					'renewed_on',
					'cancelled_on',
					'name',
					'status',
					'price'
				),
				status: Joi.string().valid('active', 'expired', 'cancelled'),
				price: Joi.number(),
				activated_on: Joi.string(),
				expires_on: Joi.string(),
				expired_on: Joi.string(),
				cancelled_on: Joi.string(),
				renewed_on: Joi.string(),
				occured_at: Joi.string(),
				action: Joi.string(),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all'),
			}
		}, {
			callee: 'userBillingSubscriptionsAppsGetAll',
			method: 'GET',
			path: 'user/billing/subscriptions/apps',
			required: 'result',
			query: query || {}
		}, raw));
	},

	/**
	 * Get app subscription for user
	 *
	 * https://api.cloudflare.com/#zone-zone-details
	 */
	userBillingSubscriptionsAppGet: function ($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'userBillingSubscriptionsAppsGet',
			method: 'GET',
			path: 'user/billing/subscriptions/apps/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Get app subscriptions for zone
	 *
	 * https://api.cloudflare.com/#zone-subscription-list
	 * https://api.cloudflare.com/#zone-subscription-search-sort-and-paginate
	 */
	userBillingSubscriptionsZoneGetAll: function ($deferred, query, raw) {
		$deferred.resolve(this._request({
			query: {
				order: Joi.string().valid(
					'created_on',
					'expires_on',
					'activated_on',
					'renewed_on',
					'cancelled_on',
					'name',
					'status',
					'price'
				),
				status: Joi.string().valid('active', 'expired', 'cancelled'),
				price: Joi.number(),
				activated_on: Joi.string(),
				expires_on: Joi.string(),
				expired_on: Joi.string(),
				cancelled_on: Joi.string(),
				renewed_on: Joi.string(),
				occured_at: Joi.string(),
				action: Joi.string(),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all'),
			}
		}, {
			callee: 'userBillingSubscriptionsZoneGetAll',
			method: 'GET',
			path: 'user/billing/subscriptions/zones',
			required: 'result',
			query: query || {}
		}, raw));
	},

	/**
	 * Get app subscription for zone
	 *
	 * https://api.cloudflare.com/#zone-zone-details
	 */
	userBillingSubscriptionsZoneGet: function ($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'userBillingSubscriptionsZoneGet',
			method: 'GET',
			path: 'user/billing/subscriptions/zones/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Get user details
	 *
	 * https://api.cloudflare.com/#user-user-details
	 */
	userGet: function ($deferred, raw) {
		$deferred.resolve(this._request(null, {
			callee: 'userGet',
			method: 'GET',
			path: 'user',
			required: 'result'
		}, raw));
	},

	/**
	 * Update user details
	 *
	 * https://api.cloudflare.com/#user-update-user
	 */
	userUpdate: function ($deferred, body, raw) {
		$deferred.resolve(this._request({
			body: {
				first_name: Joi.string().max(60),
				last_name: Joi.string().max(60),
				telephone: Joi.string().max(20),
				country: Joi.string().max(30),
				zipcode: Joi.string().max(20)
			}
		}, {
			callee: 'userGet',
			method: 'PATCH',
			path: 'user',
			required: 'result',
			body: body || {}
		}, raw));
	},

	/**
	 * Get all available plans for zone
	 *
	 * https://api.cloudflare.com/#zone-plan-available-plans
	 */
	zoneAvailablePlanGetAll: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/available_plans',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			query: query
		}, raw));
	},

	/**
	 * Get available plan for zone
	 *
	 * https://api.cloudflare.com/#zone-plan-plan-details
	 */
	zoneAvailablePlanGet: function ($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/available_plans/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Create a zone
	 *
	 * https://api.cloudflare.com/#zone-create-a-zone
	 */
	zoneNew: function ($deferred, body, raw) {
		$deferred.resolve(this._request({
			body: {
				name: Joi.string().max(253).required(),
				jump_start: Joi.boolean(),
				organization: Joi.object({
					id: Joi.string().required().length(32),
					name: Joi.string().max(100)
				})
			}
		}, {
			callee: 'zoneNew',
			method: 'POST',
			path: 'zones',
			required: 'result',
			body: body || {}
		}, raw));
	},

	/**
	 * Initiate another zone activation check
	 *
	 * https://api.cloudflare.com/#zone-initiate-another-zone-activation-check
	 */
	zoneActivationCheckNew: function ($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneActivationCheck',
			method: 'PUT',
			path: 'zones/:identifier/activation_check',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * List zones
	 *
	 * https://api.cloudflare.com/#zone-list-zones
	 */
	zoneGetAll: function ($deferred, query, raw) {
		$deferred.resolve(this._request({
			query: {
				name: Joi.string().max(253),
				status: Joi.any().valid('active', 'pending', 'initializing', 'moved', 'deleted', 'deactivated'),
				order: Joi.any().valid('name', 'status', 'email'),
				direction: Joi.any().valid('asc', 'desc'),
				match: Joi.any().valid('any', 'all')
			}
		}, {
			callee: 'zonesGetAll',
			method: 'GET',
			path: 'zones',
			required: 'result',
			query: query || {}
		}, raw));
	},

	/**
	 * Zone details
	 *
	 * https://api.cloudflare.com/#zone-zone-details
	 */
	zoneGet: function ($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneGet',
			method: 'GET',
			path: 'zones/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Zone update
	 *
	 * https://api.cloudflare.com/#zone-edit-zone-properties
	 */
	zoneUpdate: function($deferred, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			},
			body: {
				paused: Joi.boolean(),
				vanity_name_servers: Joi.array(),
				plan: {
					id: Joi.string().max(32)
				}
			}
		}, {
			callee: 'zoneUpdate',
			method: 'PATCH',
			path: 'zones/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Zone purge cache
	 *
	 * https://api.cloudflare.com/#zone-purge-all-files
	 */
	zonePurgeCache: function($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			},
			body: {
				purge_everything: Joi.boolean().required()
			}
		}, {
			callee: 'zonePurgeCache',
			method: 'DELETE',
			path: 'zones/:identifier/purge_cache',
			required: 'result',
			params: {
				identifier: identifier
			},
			body: {
				purge_everything: true
			}
		}, raw));
	},

	/**
	 * Zone purge cachge by URL or Cache-Tags
	 *
	 * https://api.cloudflare.com/#zone-purge-individual-files-by-url-and-cache-tags
	 */
	zonePurgeCacheBy: function($deferred, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			},
			body: Joi.alternatives().try(
				{
					files: Joi.array().max(30).required()
				},
				{
					tags: Joi.array().max(30).required()
				}
			).required()
		}, {
			callee: 'zonePurgeCacheBy',
			method: 'DELETE',
			path: 'zones/:identifier/purge_cache',
			required: 'result',
			params: {
				identifier: identifier
			},
			body: body || {}
		}, raw));
	},

	/**
	 * Zone delete
	 *
	 * https://api.cloudflare.com/#zone-delete-a-zone
	 */
	zoneDestroy: function($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneDestroy',
			method: 'DELETE',
			path: 'zones/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Get all settings for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-all-zone-settings
	 */
	zoneSettingsGetAll: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/settings',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			query: query
		}, raw));
	},

	/**
	 * Get always online setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-always-online-setting
	 */
	zoneSettingsAlwaysOnlineGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsAlwaysOnlineGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/always_online',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get browser cache TTL setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-always-online-setting
	 */
	zoneSettingsBrowserCacheTTLGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsBrowserCacheTTLGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/browser_cache_ttl',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get browser check setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-browser-check-setting
	 */
	zoneSettingsBrowserCheckGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsBrowserCheckGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/browser_check',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get cache level setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-cache-level-setting
	 */
	zoneSettingsCacheLevelGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsCacheLevelGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/cache_level',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get challenge TTL setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-challenge-ttl-setting
	 */
	zoneSettingsChallengeTTLGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsChallengeTTLGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/challenge_ttl',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get development mode setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-development-mode-setting
	 */
	zoneSettingsDevelopmentModeGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsDevelopmentModeGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/development_mode',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},
	
	/**
	 * Get email obfuscation setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-email-obfuscation-setting
	 */
	zoneSettingsEmailObfuscationGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsEmailObfuscationGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/email_obfuscation',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get hotlink protection setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-hotlink-protection-setting
	 */
	zoneSettingsHotlinkProtectionGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsHotlinkProtectionGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/hotlink_protection',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get IP geolocation setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-ip-geolocation-setting
	 */
	zoneSettingsIPGeolocationGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsIPGeolocationGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/ip_geolocation',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},
	
	/**
	 * Get ipv6 setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-ipv6-setting
	 */
	zoneSettingsIPv6Get: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsIPv6Get',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/ipv6',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},
	
	/**
	 * Get minify setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-minify-setting
	 */
	zoneSettingsMinifyGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsMinifyGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/minify',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get mobile redirect setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-mobile-redirect-setting
	 */
	zoneSettingsMobileRedirectGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsMobileRedirectGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/mobile_redirect',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get mirage setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-mirage-setting
	 */
	zoneSettingsMirageGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsMirageGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/mirage',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},
	
	/**
	 * Get polish setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-polish-setting
	 */
	zoneSettingsPolishGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsPolishGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/polish',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get rocket loader setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-rocket-loader-setting
	 */
	zoneSettingsRocketLoaderGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsRocketLoaderGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/rocket_loader',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get security header setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-security-header-hsts-setting
	 */
	zoneSettingsSecurityHeaderGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsSecurityHeaderGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/security_header',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},
	
	/**
	 * Get security level setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-security-level-setting
	 */
	zoneSettingsSecurityLevelGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsSecurityLevelGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/security_level',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},
	
	/**
	 * Get server side exclude setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-server-side-exclude-setting
	 */
	zoneSettingsServerSideExcludeGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsServerSideExcludeGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/server_side_exclude',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get SSL setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-ssl-setting
	 */
	zoneSettingsSSLGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsSSLGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/ssl',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get TLS client auth setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-tls-client-auth-setting
	 */
	zoneSettingsTLSClientAuthGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsTLSClientAuthGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/tls_client_auth',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get WAF setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-web-application-firewall-waf-setting
	 */
	zoneSettingsWAFGet: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneSettingsWAFGet',
			method: 'GET',
			path: 'zones/:zone_identifier/settings/waf',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Update settings for zone
	 *
	 * zones/:zone_identifier/settings
	 * 
	 * https://api.cloudflare.com/#zone-settings-edit-zone-settings-info
	 */
	zoneSettingsUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				items: Joi.array().items(
					Joi.object().keys({
						id: Joi.string().required(),
						value: Joi.string().required()
					}).required()
				).required()
			}
		}, {
			callee: 'zoneSettingsUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update always online setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-get-always-online-setting
	 */
	zoneSettingsAlwaysOnlineUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off').required()
			}
		}, {
			callee: 'zoneSettingsAlwaysOnlineUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/always_online',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update browser cache TTL setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-browser-cache-ttl-setting
	 */
	zoneSettingsBrowserCacheTTLUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.number().valid(
					30,
					60,
					300,
					1200,
					1800,
					3600,
					7200,
					10800,
					14400,
					18000,
					28800,
					43200,
					57600,
					72000,
					86400,
					172800,
					259200,
					345600,
					432000,
					691200,
					1382400,
					2073600,
					2678400,
					5356800,
					16070400,
					31536000
				).required()
			}
		}, {
			callee: 'zoneSettingsBrowserCacheTTLUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/browser_cache_ttl',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update browser check setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-browser-check-setting
	 */
	zoneSettingsBrowserCheckUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off').required()
			}
		}, {
			callee: 'zoneSettingsBrowserCheckUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/browser_check',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update cache level setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-cache-level-setting
	 */
	zoneSettingsCacheLevelUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('aggressive', 'basic', 'simplified').required()
			}
		}, {
			callee: 'zoneSettingsCacheLevelUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/cache_level',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update challenge TTL setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-challenge-ttl-setting
	 */
	zoneSettingsChallengeTTLUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.number().valid(
					300,
					900,
					1800,
					2700,
					3600,
					7200,
					10800,
					14400,
					28800,
					57600,
					86400,
					604800,
					2592000,
					31536000
				).required()
			}
		}, {
			callee: 'zoneSettingsChallengeTTLUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/challenge_ttl',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},
	
	/**
	 * Update development mode setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-development-mode-setting
	 */
	zoneSettingsDevelopmentModeUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off').required()
			}
		}, {
			callee: 'zoneSettingsDevelopmentModeUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/development_mode',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update email obfuscation setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-email-obfuscation-setting
	 */
	zoneSettingsEmailObfuscationUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off').required()
			}
		}, {
			callee: 'zoneSettingsEmailObfuscationUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/email_obfuscation',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update hotlink protection setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-hotlink-protection-setting
	 */
	zoneSettingsHotlinkProtectionUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off').required()
			}
		}, {
			callee: 'zoneSettingsHotlinkProtectionUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/hotlink_protection',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update IP geolocation setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-ip-geolocation-setting
	 */
	zoneSettingsIPGeolocationUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off').required()
			}
		}, {
			callee: 'zoneSettingsIPGeolocationUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/ip_geolocation',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},
	
	/**
	 * Update ipv6 setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-ipv6-setting
	 */
	zoneSettingsIPv6Update: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off').required()
			}
		}, {
			callee: 'zoneSettingsIPv6Update',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/ipv6',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},
	
	/**
	 * Update minify setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-minify-setting
	 */
	zoneSettingsMinifyUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.object({
					css: Joi.string().valid('on', 'off'),
					html: Joi.string().valid('on', 'off'),
					js: Joi.string().valid('on', 'off')
				}).min(1).required()
			}
		}, {
			callee: 'zoneSettingsMinifyUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/minify',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update mobile redirect setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-mobile-redirect-setting
	 */
	zoneSettingsMobileRedirectUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.object({
					status: Joi.string().valid('on', 'off').required(),
					mobile_subdomain: Joi.string().required(),
					strip_uri: Joi.boolean().required()
				}).required()
			}
		}, {
			callee: 'zoneSettingsMobileRedirectUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/mobile_redirect',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update mirage setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-mirage-setting
	 */
	zoneSettingsMirageUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off').required()
			}
		}, {
			callee: 'zoneSettingsMirageUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/mirage',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},
	
	/**
	 * Update polish setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-polish-setting
	 */
	zoneSettingsPolishUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('off', 'lossless', 'lossy').required()
			}
		}, {
			callee: 'zoneSettingsPolishUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/polish',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update rocket loader setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-rocket-loader-setting
	 */
	zoneSettingsRocketLoaderUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off', 'manual').required()
			}
		}, {
			callee: 'zoneSettingsRocketLoaderUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/rocket_loader',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},
	
	/**
	 * Update security header setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-security-header-hsts-setting
	 */
	zoneSettingsSecurityHeaderUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.object({
					strict_transport_security: Joi.object({
						preload: Joi.boolean().required(),
						enabled: Joi.boolean().required(),
						max_age: Joi.number().max(86400).required(),
						include_subdomains: Joi.boolean().required(),
						nosniff: Joi.boolean().required()
					}).required()
				}).required()
			}
		}, {
			callee: 'zoneSettingsSecurityHeaderUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/security_header',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update security level setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-security-level-setting
	 */
	zoneSettingsSecurityLevelUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid(
					'essentially_off',
					'low',
					'medium',
					'high',
					'under_attack'
				).required()
			}
		}, {
			callee: 'zoneSettingsSecurityLevelUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/security_level',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},
	
	/**
	 * Update tls auth setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-tls-client-auth-setting
	 */
	zoneSettingsTLSClientAuthUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off')
			}
		}, {
			callee: 'zoneSettingsTLSClientAuthUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/tls_client_auth',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body || {}
		}, raw));
	},

	/**
	 * Update WAF setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-web-application-firewall-waf-setting
	 */
	zoneSettingsWAFUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off')
			}
		}, {
			callee: 'zoneSettingsWAFUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/waf',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body || {}
		}, raw));
	},

	/**
	 * Update server side exclude setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-server-side-exclude-setting
	 */
	zoneSettingsServerSideExcludeUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('on', 'off').required()
			}
		}, {
			callee: 'zoneSettingsServerSideExcludeUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/server_side_exclude',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Update SSL setting for zone
	 *
	 * https://api.cloudflare.com/#zone-settings-change-ssl-setting
	 */
	zoneSettingsSSLUpdate: function($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				value: Joi.string().valid('off', 'flexible', 'full', 'full_strict').required()
			}
		}, {
			callee: 'zoneSettingsSSLUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/settings/ssl',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Get available custom pages for zone
	 *
	 * https://api.cloudflare.com/#custom-pages-for-a-zone-available-custom-pages
	 */
	zoneCustomPageGetAll: function ($deferred, zone_identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneCustomPageGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/custom_pages',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			}
		}, raw));
	},

	/**
	 * Get available custom page for zone
	 *
	 * https://api.cloudflare.com/#custom-pages-for-a-zone-custom-page-details
	 */
	zoneCustomPageGet: function ($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().required()
			}
		}, {
			callee: 'zoneCustomPageGet',
			method: 'GET',
			path: 'zones/:zone_identifier/custom_pages/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Update custom page URL for zone
	 *
	 * https://api.cloudflare.com/#custom-pages-for-a-zone-update-custom-page-url
	 */
	zoneCustomPageUpdate: function($deferred, zone_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().required()
			},
			body: {
				url: Joi.string().required(),
				state: Joi.string().valid('default', 'customized').required()
			}
		}, {
			callee: 'zoneSettingsTLSClientAuthUpdate',
			method: 'PUT',
			path: 'zones/:zone_identifier/custom_pages/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			},
			body: body || {}
		}, raw));
	},

	/**
	 * Get WAF packages for zone
	 *
	 * https://api.cloudflare.com/#waf-rule-packages-list-firewall-packages
	 */
	zoneFirewallWAFPackageGetAll: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			query: {
				name: Joi.string(),
				order: Joi.string(), // NOTE: This is not clarified properly in their docs
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all')
			}
		}, {
			callee: 'zoneFirewallWAFPackageGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/firewall/waf/packages',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Get WAF package for zone
	 *
	 * https://api.cloudflare.com/#waf-rule-packages-firewall-package-info
	 */
	zoneFirewallWAFPackageGet: function ($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneFirewallWAFPackageGet',
			method: 'GET',
			path: 'zones/:zone_identifier/firewall/waf/packages/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Update WAF package for zone
	 *
	 * https://api.cloudflare.com/#waf-rule-packages-change-anomaly-detection-web-application-firewall-package-settings
	 */
	zoneFirewallWAFPackageUpdate: function ($deferred, zone_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				sensitivity: Joi.string().valid('high', 'low', 'off'),
				action_mode: Joi.string().valid('simulate', 'block', 'challenge')
			}).min(1).required()
		}, {
			callee: 'zoneFirewallWAFPackageUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/firewall/waf/packages/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			},
			body: body || {}
		}, raw));
	},

	/**
	 * Get WAF rule groups for zone
	 *
	 * https://api.cloudflare.com/#waf-rule-groups-list-rule-groups
	 */
	zoneFirewallWAFRuleGroupGetAll: function ($deferred, zone_identifier, package_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				package_identifier: Joi.string().length(32).required()
			},
			query: {
				name: Joi.string(),
				mode: Joi.string().valid('on', 'off'),
				rules_count: Joi.number(),
				order: Joi.string().valid('mode', 'rules_count'),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all')
			}
		}, {
			callee: 'zoneFirewallWAFRuleGroupGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/firewall/waf/packages/:package_identifier/groups',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				package_identifier: package_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Get WAF rule group for zone
	 *
	 * https://api.cloudflare.com/#waf-rule-groups-rule-group-info
	 */
	zoneFirewallWAFRuleGroupGet: function ($deferred, zone_identifier, package_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				package_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneFirewallWAFRuleGroupGet',
			method: 'GET',
			path: 'zones/:zone_identifier/firewall/waf/packages/:package_identifier/groups/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				package_identifier: package_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Update WAF rule group for zone
	 *
	 * https://api.cloudflare.com/#waf-rule-groups-update-rule-group
	 */
	zoneFirewallWAFRuleGroupUpdate: function ($deferred, zone_identifier, package_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				package_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				mode: Joi.string().valid('on', 'off')
			}).required()
		}, {
			callee: 'zoneFirewallWAFRuleGroupUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/firewall/waf/packages/:package_identifier/groups/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				package_identifier: package_identifier,
				identifier: identifier
			},
			body: body || {}
		}, raw));
	},

	/**
	 * Get WAF package rules for zone
	 *
	 * https://api.cloudflare.com/#waf-rules-list-rules
	 */
	zoneFirewallWAFPackageRuleGetAll: function ($deferred, zone_identifier, package_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				package_identifier: Joi.string().length(32).required()
			},
			query: {
				description: Joi.string(),
				mode: Joi.any(), // NOTE: documentation was very unclear about this param
				priority: Joi.number(),
				group_id: Joi.string().length(32),
				order: Joi.string().valid('priority', 'group_id', 'description'),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all')
			}
		}, {
			callee: 'zoneFirewallWAFPackageRuleGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/firewall/waf/packages/:package_identifier/rules',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				package_identifier: package_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Get WAF package rule for zone
	 *
	 * https://api.cloudflare.com/#waf-rules-rule-info
	 */
	zoneFirewallWAFPackageRuleGet: function ($deferred, zone_identifier, package_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				package_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().required()
			}
		}, {
			callee: 'zoneFirewallWAFPackageRuleGet',
			method: 'GET',
			path: 'zones/:zone_identifier/firewall/waf/packages/:package_identifier/rules/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				package_identifier: package_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Update WAF package rule for zone
	 *
	 * https://api.cloudflare.com/#waf-rules-update-rule
	 */
	zoneFirewallWAFPackageRuleUpdate: function ($deferred, zone_identifier, package_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				package_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().required()
			},
			body: Joi.object({
				mode: Joi.string().valid('default', 'disable', 'simulate', 'block', 'challenge', 'on', 'off').required()
			}).required()
		}, {
			callee: 'zoneFirewallWAFRuleGroupUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/firewall/waf/packages/:package_identifier/rules/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				package_identifier: package_identifier,
				identifier: identifier
			},
			body: body || {}
		}, raw));
	},

	/**
	 * List DNS records for zone
	 *
	 * https://api.cloudflare.com/#dns-records-for-a-zone-list-dns-records
	 */
	zoneDNSRecordGetAll: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			query: {
				type: Joi.string().valid('A', 'AAAA', 'CNAME', 'TXT', 'SRV', 'LOC', 'MX', 'NS', 'SPF'),
				name: Joi.string().max(255),
				content: Joi.string(),
				order: Joi.string().valid('type', 'name', 'content', 'ttl', 'proxied'),
				direction: Joi.string().valid('asc', 'desc'),
				match: Joi.string().valid('any', 'all')
			}
		}, {
			callee: 'zoneDNSRecordsGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/dns_records',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Create DNS record for zone
	 *
	 * https://api.cloudflare.com/#dns-records-for-a-zone-list-dns-records
	 */
	zoneDNSRecordNew: function ($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				type: Joi.string().valid('A', 'AAAA', 'CNAME', 'TXT', 'SRV', 'LOC', 'MX', 'NS', 'SPF').required(),
				name: Joi.string().max(255).required(),
				content: Joi.string().required(),
				ttl: Joi.number().max(2147483647)
			}
		}, {
			callee: 'zoneDNSRecordCreate',
			method: 'POST',
			path: 'zones/:zone_identifier/dns_records',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body || {}
		}, raw));
	},

	
	/**
	 * Get DNS record for zone
	 *
	 * https://api.cloudflare.com/#dns-records-for-a-zone-dns-record-details
	 */
	zoneDNSRecordGet: function ($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneGet',
			method: 'GET',
			path: 'zones/:zone_identifier/dns_records/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Update dns record for zone
	 *
	 * https://api.cloudflare.com/#dns-records-for-a-zone-update-dns-record
	 */
	zoneDNSRecordUpdate: function ($deferred, zone_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			},
			body: Joi.object({
				type: Joi.string().valid('A', 'AAAA', 'CNAME', 'TXT', 'SRV', 'LOC', 'MX', 'NS', 'SPF'),
				name: Joi.string().max(255),
				content: Joi.string(),
				ttl: Joi.number().max(2147483647)
			}).min(1).required()
		}, {
			callee: 'zoneDNSRecordUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/dns_records/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			},
			body: body || {}
		}, raw));
	},

	/**
	 * Delete dns record for zone
	 *
	 * https://api.cloudflare.com/#dns-records-for-a-zone-delete-dns-record
	 */
	zoneDNSRecordDestroy: function ($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneDNSRecordDestroy',
			method: 'DELETE',
			path: 'zones/:zone_identifier/dns_records/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			}
		}, raw));
	},

	/**
	 * Get analytics dashboard data
	 *
	 * https://api.cloudflare.com/#zone-analytics-dashboard
	 */
	zoneAnalyticsDashboardGet: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			query: {
				since: Joi.alternatives().try(Joi.string(), Joi.number()),
				until: Joi.alternatives().try(Joi.string(), Joi.number()),
				exclude_series: Joi.boolean(),
				continuous: Joi.boolean()
			}
		}, {
			callee: 'zoneAnalyticsDashboardGet',
			method: 'GET',
			path: 'zones/:zone_identifier/analytics/dashboard',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * List firewall access rules for zone
	 *
	 * https://api.cloudflare.com/#firewall-access-rule-for-a-zone-list-access-rules
	 */
	zoneFirewallAccessRuleGetAll: function ($deferred, zone_identifier, query, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			query: {
				mode: Joi.any().valid('block', 'challenge', 'whitelist'),
				configuration_target: Joi.any().valid('ip', 'ip_range', 'country'),
				configuration_value: Joi.string(),
				order: Joi.any().valid('configuration_target', 'configuration_value', 'mode'),
				direction: Joi.any().valid('asc', 'desc'),
				match: Joi.any().valid('any', 'all')
			}
		}, {
			callee: 'zoneFirewallAccessRulesGetAll',
			method: 'GET',
			path: 'zones/:zone_identifier/firewall/access_rules/rules',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			query: query || {}
		}, raw));
	},

	/**
	 * Create firewall access rule for zone
	 *
	 * https://api.cloudflare.com/#firewall-access-rule-for-a-zone-create-access-rule
	 */
	zoneFirewallAccessRuleNew: function ($deferred, zone_identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required()
			},
			body: {
				mode: Joi.any().valid('block', 'challenge', 'whitelist').required(),
				configuration: Joi.object({
					target: Joi.any().valid('ip', 'ip_range', 'country').required(),
					value: Joi.string().required()
				}).required(),
				notes: Joi.string()
			}
		}, {
			callee: 'zoneFirewallAccessRuleNew',
			method: 'POST',
			path: 'zones/:zone_identifier/firewall/access_rules/rules',
			required: 'result',
			params: {
				zone_identifier: zone_identifier
			},
			body: body || {}
		}, raw));
	},

	/**
	 * Update firewall access rule for zone
	 *
	 * https://api.cloudflare.com/#firewall-access-rule-for-a-zone-update-access-rule
	 */
	zoneFirewallAccessRuleUpdate: function($deferred, zone_identifier, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			},
			body: {
				mode: Joi.any().valid('block', 'challenge', 'whitelist').required(),
				configuration: Joi.object({
					target: Joi.any().valid('ip', 'ip_range', 'country').required(),
					value: Joi.string().required()
				}).required(),
				notes: Joi.string()
			}
		}, {
			callee: 'zoneFirewallAccessRuleUpdate',
			method: 'PATCH',
			path: 'zones/:zone_identifier/firewall/access_rules/rules/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Delete firewall access rule for zone
	 *
	 * https://api.cloudflare.com/#firewall-access-rule-for-a-zone-delete-access-rule
	 */
	zoneFirewallAccessRuleDestroy: function($deferred, zone_identifier, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				zone_identifier: Joi.string().length(32).required(),
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'zoneFirewallAccessRuleDestroy',
			method: 'DELETE',
			path: 'zones/:zone_identifier/firewall/access_rules/rules/:identifier',
			required: 'result',
			params: {
				zone_identifier: zone_identifier,
				identifier: identifier
			},
		}, raw));
	},

	/**
	 * List firewall access rules for user
	 *
	 * https://api.cloudflare.com/#user-level-firewall-access-rule-list-access-rules
	 */
	userFirewallAccessRuleGetAll: function ($deferred, query, raw) {
		$deferred.resolve(this._request({
			query: {
				mode: Joi.any().valid('block', 'challenge', 'whitelist'),
				configuration_target: Joi.any().valid('ip', 'ip_range', 'country'),
				configuration_value: Joi.string(),
				order: Joi.any().valid('configuration_target', 'configuration_value', 'mode'),
				direction: Joi.any().valid('asc', 'desc'),
				match: Joi.any().valid('any', 'all')
			}
		}, {
			callee: 'userFirewallAccessRuleGetAll',
			method: 'GET',
			path: 'user/firewall/access_rules/rules',
			required: 'result',
			query: query || {}
		}, raw));
	},

	/**
	 * Create firewall access rule for user
	 *
	 * https://api.cloudflare.com/#user-level-firewall-access-rule-create-access-rule
	 */
	userFirewallAccessRuleNew: function ($deferred, body, raw) {
		$deferred.resolve(this._request({
			body: {
				mode: Joi.any().valid('block', 'challenge', 'whitelist').required(),
				configuration: Joi.object({
					target: Joi.any().valid('ip', 'ip_range', 'country').required(),
					value: Joi.string().required()
				}).required(),
				notes: Joi.string()
			}
		}, {
			callee: 'userFirewallAccessRuleNew',
			method: 'POST',
			path: 'user/firewall/access_rules/rules',
			required: 'result',
			body: body || {}
		}, raw));
	},

	/**
	 * Update firewall access rule for user
	 *
	 * https://api.cloudflare.com/#user-level-firewall-access-rule-update-access-rule
	 */
	userFirewallAccessRuleUpdate: function($deferred, identifier, body, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			},
			body: {
				mode: Joi.any().valid('block', 'challenge', 'whitelist').required(),
				configuration: Joi.object({
					target: Joi.any().valid('ip', 'ip_range', 'country').required(),
					value: Joi.string().required()
				}).required(),
				notes: Joi.string()
			}
		}, {
			callee: 'userFirewallAccessRuleUpdate',
			method: 'PATCH',
			path: 'user/firewall/access_rules/rules/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			},
			body: body
		}, raw));
	},

	/**
	 * Delete firewall access rule for user
	 *
	 * https://api.cloudflare.com/#user-level-firewall-access-rule-delete-access-rule
	 */
	userFirewallAccessRuleDestroy: function($deferred, identifier, raw) {
		$deferred.resolve(this._request({
			params: {
				identifier: Joi.string().length(32).required()
			}
		}, {
			callee: 'userFirewallAccessRuleDestroy',
			method: 'DELETE',
			path: 'user/firewall/access_rules/rules/:identifier',
			required: 'result',
			params: {
				identifier: identifier
			}
		}, raw));
	}
});

module.exports = CloudFlare;