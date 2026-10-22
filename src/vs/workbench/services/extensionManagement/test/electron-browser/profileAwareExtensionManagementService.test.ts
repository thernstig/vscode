/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDownloadService } from '../../../../../platform/download/common/download.js';
import { DidUninstallExtensionEvent, IAllowedExtensionsService, IGalleryExtension, ILocalExtension, InstallExtensionResult, InstallOperation, InstallOptions, UninstallExtensionInfo, UninstallOptions } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionType, TargetPlatform } from '../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { getSingletonServiceDescriptors } from '../../../../../platform/instantiation/common/extensions.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { DidChangeProfilesEvent, IUserDataProfile, IUserDataProfileOptions, IUserDataProfilesService, toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { INativeWorkbenchEnvironmentService } from '../../../environment/electron-browser/environmentService.js';
import { IRemoteAgentConnection, IRemoteAgentService } from '../../../remote/common/remoteAgentService.js';
import { IRemoteUserDataProfilesService } from '../../../userDataProfile/common/remoteUserDataProfiles.js';
import { IUserDataProfileService } from '../../../userDataProfile/common/userDataProfile.js';
import { UserDataProfileService } from '../../../userDataProfile/common/userDataProfileService.js';
import { DidChangeProfileEvent } from '../../common/extensionManagement.js';
import { RemoteExtensionManagementService } from '../../common/remoteExtensionManagementService.js';
import { NativeExtensionManagementService } from '../../electron-browser/nativeExtensionManagementService.js';

interface ExtensionCall {
	readonly command: string;
	readonly profileLocation: string | undefined;
	readonly applicationScoped: boolean | undefined;
}

/** Records the final server boundary; profile selection and event filtering remain in the real adapters. */
class ExtensionChannel extends Disposable implements IChannel {
	readonly calls: ExtensionCall[] = [];
	readonly installed = new Map<string, ILocalExtension[]>();
	readonly didInstall = this._register(new Emitter<readonly InstallExtensionResult[]>());
	readonly didUninstall = this._register(new Emitter<DidUninstallExtensionEvent>());

	constructor(readonly defaultProfile: IUserDataProfile, readonly extension: ILocalExtension) {
		super();
	}

	listen<T>(event: string): Event<T> {
		switch (event) {
			case 'onDidInstallExtensions': return this.didInstall.event as Event<T>;
			case 'onDidUninstallExtension': return this.didUninstall.event as Event<T>;
			default: return Event.None;
		}
	}

	async call<T>(command: string, args: readonly (object | string | number | null | undefined)[] = []): Promise<T> {
		let profileLocation: URI | undefined;
		let applicationScoped: boolean | undefined;
		switch (command) {
			case 'getInstalled':
				profileLocation = args[1] as URI | undefined;
				break;
			case 'install':
			case 'installFromGallery': {
				const options = args[1] as InstallOptions;
				profileLocation = options.profileLocation;
				applicationScoped = options.isApplicationScoped;
				break;
			}
			case 'uninstall': {
				const [extension, options] = args as readonly [ILocalExtension, UninstallOptions];
				profileLocation = options.profileLocation;
				applicationScoped = extension.isApplicationScoped;
				break;
			}
			case 'uninstallExtensions': {
				const [extensions] = args as readonly [UninstallExtensionInfo[]];
				assert.strictEqual(extensions.length, 1);
				profileLocation = extensions[0].options?.profileLocation;
				applicationScoped = extensions[0].extension.isApplicationScoped;
				break;
			}
			default: throw new Error(`Unexpected extension command: ${command}`);
		}
		this.calls.push({ command, profileLocation: profileLocation?.toString(), applicationScoped });
		if (command === 'getInstalled') {
			return (this.installed.get((profileLocation ?? this.defaultProfile.extensionsResource).toString()) ?? []) as T;
		}
		return (command === 'install' || command === 'installFromGallery' ? this.extension : undefined) as T;
	}
}

/** Only remote profile persistence is replaced; the workbench mapper and its IPC client are real. */
class ProfilesChannel extends Disposable implements IChannel {
	readonly created: { id: string; name: string; options: IUserDataProfileOptions | undefined }[] = [];
	private readonly onDidChangeProfiles = this._register(new Emitter<DidChangeProfilesEvent>());
	readonly profiles: IUserDataProfile[];

	constructor(readonly home: URI, defaultProfile: IUserDataProfile) {
		super();
		this.profiles = [defaultProfile];
	}

	listen<T>(event: string): Event<T> {
		return event === 'onDidChangeProfiles' ? this.onDidChangeProfiles.event as Event<T> : Event.None;
	}

	async call<T>(command: string, args?: [string, string, IUserDataProfileOptions?]): Promise<T> {
		assert.strictEqual(command, 'createProfile');
		assert.ok(args);
		const [id, name, options] = args;
		this.created.push({ id, name, options });
		const profile = toUserDataProfile(id, name, joinPath(this.home, id), joinPath(this.home, 'cache'), options, this.profiles[0]);
		this.profiles.push(profile);
		this.onDidChangeProfiles.fire({ added: [profile], removed: [], updated: [], all: this.profiles });
		return profile as T;
	}
}

function localExtension(name: string, location: URI): ILocalExtension {
	return {
		identifier: { id: `publisher.${name}` },
		manifest: { name, publisher: 'publisher', version: '1.0.0', engines: { vscode: '*' } },
		location,
		type: ExtensionType.User,
		targetPlatform: TargetPlatform.UNDEFINED,
		isBuiltin: false, isValid: true, validations: [],
		isWorkspaceScoped: false, isMachineScoped: false, isApplicationScoped: false,
		publisherId: null, isPreReleaseVersion: false, hasPreReleaseVersion: false,
		private: false, preRelease: false, updated: false, pinned: false, forceAutoUpdate: false,
		source: 'gallery', size: 0,
	};
}

suite('Profile-aware extension management routing', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function createFixture(current: 'default' | 'named' = 'default') {
		const localHome = URI.file('/local/profiles');
		const remoteHome = URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+test', path: '/remote/profiles' });
		const localDefault = { ...toUserDataProfile('local-default', 'Default', joinPath(localHome, 'default'), localHome), isDefault: true };
		const localNamed = toUserDataProfile('named', 'Development', joinPath(localHome, 'named'), localHome);
		const remoteDefault = { ...toUserDataProfile('remote-default', 'Default', joinPath(remoteHome, 'default'), remoteHome), isDefault: true };
		const profileService = disposables.add(new UserDataProfileService(current === 'default' ? localDefault : localNamed));
		const profilesChannel = disposables.add(new ProfilesChannel(remoteHome, remoteDefault));
		const connection = new class extends mock<IRemoteAgentConnection>() {
			override getChannel<T extends IChannel>(name: string): T {
				assert.strictEqual(name, 'userDataProfiles');
				return profilesChannel as IChannel as T;
			}
		}();
		const environment = new class extends mock<IRemoteAgentEnvironment>() {
			override profiles = { all: profilesChannel.profiles, home: remoteHome };
		}();
		const remoteProfilesDescriptor = getSingletonServiceDescriptors().find(([id]) => id === IRemoteUserDataProfilesService)?.[1];
		assert.ok(remoteProfilesDescriptor);
		const services = new ServiceCollection([IRemoteUserDataProfilesService, remoteProfilesDescriptor]);
		const instantiationService = disposables.add(new TestInstantiationService(services, true, undefined, true));
		instantiationService.set(IUserDataProfileService, profileService);
		instantiationService.stub(IUserDataProfilesService, { profiles: [localDefault, localNamed], defaultProfile: localDefault, onDidChangeProfiles: Event.None });
		instantiationService.stub(IRemoteAgentService, {
			getConnection: () => connection,
			getEnvironment: async () => environment,
		});
		instantiationService.stub(INativeWorkbenchEnvironmentService, { remoteAuthority: 'ssh-remote+test' });
		instantiationService.set(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.set(ILogService, new NullLogService());
		instantiationService.stub(IProductService, { quality: 'stable' });
		instantiationService.stub(IAllowedExtensionsService, { isAllowed: () => true });
		const fileService = disposables.add(new FileService(new NullLogService()));
		instantiationService.set(IFileService, fileService);
		instantiationService.set(IUriIdentityService, disposables.add(new UriIdentityService(fileService)));
		instantiationService.stub(IDownloadService, {});
		const remoteProfiles = instantiationService.get(IRemoteUserDataProfilesService);
		await remoteProfiles.getRemoteProfiles();
		// The existing mapper does not own its IPC client. Dispose that child in this fixture too.
		disposables.add((remoteProfiles as IRemoteUserDataProfilesService & { remoteUserDataProfilesService: IDisposable }).remoteUserDataProfilesService);
		const localChannel = disposables.add(new ExtensionChannel(localDefault, localExtension('extension', URI.file('/local/extensions/extension'))));
		const remoteChannel = disposables.add(new ExtensionChannel(remoteDefault, localExtension('extension', joinPath(remoteHome, 'extensions/extension'))));
		const local = disposables.add(instantiationService.createInstance(NativeExtensionManagementService, localChannel));
		const remote = disposables.add(instantiationService.createInstance(RemoteExtensionManagementService, remoteChannel));
		const gallery = new class extends mock<IGalleryExtension>() {
			override identifier = { id: 'publisher.extension', uuid: 'extension-uuid' };
		}();
		return { local, remote, localChannel, remoteChannel, localDefault, localNamed, remoteDefault, remoteHome, profileService, profilesChannel, remoteProfiles, gallery };
	}

	for (const current of ['default', 'named'] as const) {
		test(`routes installation and removal through the current ${current} profile on each server`, async () => {
			const fixture = await createFixture(current);
			const remoteProfile = await fixture.remoteProfiles.getRemoteProfile(current === 'default' ? fixture.localDefault : fixture.localNamed);
			for (const [service, channel, profile] of [
				[fixture.local, fixture.localChannel, current === 'default' ? fixture.localDefault.extensionsResource : fixture.localNamed.extensionsResource],
				[fixture.remote, fixture.remoteChannel, current === 'default' ? undefined : remoteProfile.extensionsResource],
			] as const) {
				await service.installFromGallery(fixture.gallery);
				await service.install(URI.file('/download/extension.vsix'));
				await service.uninstall(channel.extension);
				await service.uninstallExtensions([{ extension: channel.extension }]);
				await service.getInstalled();
				assert.deepStrictEqual(channel.calls, [
					{ command: 'installFromGallery', profileLocation: profile?.toString(), applicationScoped: undefined },
					{ command: 'install', profileLocation: profile?.toString(), applicationScoped: undefined },
					{ command: 'uninstall', profileLocation: profile?.toString(), applicationScoped: false },
					{ command: 'uninstallExtensions', profileLocation: profile?.toString(), applicationScoped: false },
					{ command: 'getInstalled', profileLocation: profile?.toString(), applicationScoped: undefined },
				]);
			}
			assert.deepStrictEqual(fixture.profilesChannel.created, current === 'default' ? [] : [
				{ id: 'named', name: 'Development', options: { transient: undefined, useDefaultFlags: undefined } },
			]);
		});
	}

	test('maps explicitly selected local profiles and accepts an already remote profile resource', async () => {
		const fixture = await createFixture();
		await fixture.local.installFromGallery(fixture.gallery, { profileLocation: fixture.localNamed.extensionsResource });
		await fixture.remote.installFromGallery(fixture.gallery, { profileLocation: fixture.localNamed.extensionsResource });
		const remoteNamed = await fixture.remoteProfiles.getRemoteProfile(fixture.localNamed);
		await fixture.remote.uninstall(fixture.remoteChannel.extension, { profileLocation: fixture.localDefault.extensionsResource });
		await fixture.remote.uninstallExtensions([{ extension: fixture.remoteChannel.extension, options: { profileLocation: remoteNamed.extensionsResource } }]);
		assert.deepStrictEqual({ local: fixture.localChannel.calls, remote: fixture.remoteChannel.calls }, {
			local: [{ command: 'installFromGallery', profileLocation: fixture.localNamed.extensionsResource.toString(), applicationScoped: undefined }],
			remote: [
				{ command: 'installFromGallery', profileLocation: remoteNamed.extensionsResource.toString(), applicationScoped: undefined },
				{ command: 'uninstall', profileLocation: fixture.remoteDefault.extensionsResource.toString(), applicationScoped: false },
				{ command: 'uninstallExtensions', profileLocation: remoteNamed.extensionsResource.toString(), applicationScoped: false },
			],
		});
	});

	for (const target of ['local', 'remote'] as const) {
		test(`forwards application scope only to the selected ${target} server`, async () => {
			const fixture = await createFixture('named');
			const service = fixture[target];
			const channel = target === 'local' ? fixture.localChannel : fixture.remoteChannel;
			const profile = target === 'local' ? fixture.localNamed : await fixture.remoteProfiles.getRemoteProfile(fixture.localNamed);
			await service.installFromGallery(fixture.gallery, { isApplicationScoped: true });
			await service.uninstallExtensions([{ extension: { ...channel.extension, isApplicationScoped: true } }]);
			assert.deepStrictEqual({ selected: channel.calls, other: (target === 'local' ? fixture.remoteChannel : fixture.localChannel).calls }, {
				selected: [
					{ command: 'installFromGallery', profileLocation: profile.extensionsResource.toString(), applicationScoped: true },
					{ command: 'uninstallExtensions', profileLocation: profile.extensionsResource.toString(), applicationScoped: true },
				],
				other: [],
			});
		});
	}

	test('filters installation and removal events by the mapped profile while admitting application scope', async () => {
		const fixture = await createFixture('named');
		const remoteNamed = await fixture.remoteProfiles.getRemoteProfile(fixture.localNamed);
		for (const [service, channel, current, other] of [
			[fixture.local, fixture.localChannel, fixture.localNamed, fixture.localDefault],
			[fixture.remote, fixture.remoteChannel, remoteNamed, fixture.remoteDefault],
		] as const) {
			const installed: string[] = [];
			const uninstalled: string[] = [];
			disposables.add(service.onDidInstallExtensions(results => installed.push(...results.map(result => result.identifier.id))));
			disposables.add(service.onDidUninstallExtension(event => uninstalled.push(event.identifier.id)));
			for (const [id, profile, applicationScoped] of [
				['current', current, false], ['other', other, false], ['application', other, true],
			] as const) {
				const identifier = { id };
				const installProcessed = Event.toPromise(service.onProfileAwareDidInstallExtensions);
				channel.didInstall.fire([{ identifier, local: { ...channel.extension, identifier, isApplicationScoped: applicationScoped }, operation: InstallOperation.Install, profileLocation: profile.extensionsResource }]);
				await installProcessed;
				const uninstallProcessed = Event.toPromise(service.onProfileAwareDidUninstallExtension);
				channel.didUninstall.fire({ identifier, applicationScoped, profileLocation: profile.extensionsResource });
				await uninstallProcessed;
			}
			assert.deepStrictEqual({ installed, uninstalled }, { installed: ['current', 'application'], uninstalled: ['current', 'application'] });
		}
	});

	test('switching profiles computes each server delta from its own profile resources', async () => {
		const fixture = await createFixture();
		const remoteNamed = await fixture.remoteProfiles.getRemoteProfile(fixture.localNamed);
		const changes: { server: string; added: string[]; removed: string[] }[] = [];
		for (const [server, service, channel, previous, current] of [
			['local', fixture.local, fixture.localChannel, fixture.localDefault, fixture.localNamed],
			['remote', fixture.remote, fixture.remoteChannel, fixture.remoteDefault, remoteNamed],
		] as const) {
			channel.installed.set(previous.extensionsResource.toString(), [localExtension(`${server}-old`, joinPath(previous.location, 'old'))]);
			channel.installed.set(current.extensionsResource.toString(), [localExtension(`${server}-new`, joinPath(current.location, 'new'))]);
			disposables.add(service.onDidChangeProfile((event: DidChangeProfileEvent) => changes.push({
				server, added: event.added.map(extension => extension.identifier.id), removed: event.removed.map(extension => extension.identifier.id),
			})));
		}
		await fixture.profileService.updateCurrentProfile(fixture.localNamed);
		fixture.localChannel.calls.length = 0;
		fixture.remoteChannel.calls.length = 0;
		await fixture.local.uninstall(fixture.localChannel.extension);
		await fixture.remote.uninstall(fixture.remoteChannel.extension);
		assert.deepStrictEqual({ changes: changes.sort((a, b) => a.server.localeCompare(b.server)), local: fixture.localChannel.calls, remote: fixture.remoteChannel.calls }, {
			changes: [
				{ server: 'local', added: ['publisher.local-new'], removed: ['publisher.local-old'] },
				{ server: 'remote', added: ['publisher.remote-new'], removed: ['publisher.remote-old'] },
			],
			local: [{ command: 'uninstall', profileLocation: fixture.localNamed.extensionsResource.toString(), applicationScoped: false }],
			remote: [{ command: 'uninstall', profileLocation: remoteNamed.extensionsResource.toString(), applicationScoped: false }],
		});
	});
});
