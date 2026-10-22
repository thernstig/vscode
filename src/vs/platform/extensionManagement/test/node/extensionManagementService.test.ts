/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { buffer } from '../../../../base/node/zip.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { IDownloadService } from '../../../download/common/download.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IExtensionGalleryManifestService } from '../../common/extensionGalleryManifest.js';
import { IAllowedExtensionsService, IExtensionGalleryService, ILocalExtension } from '../../common/extensionManagement.js';
import { IExtensionsProfileScannerService } from '../../common/extensionsProfileScannerService.js';
import { IExtensionsScannerService } from '../../common/extensionsScannerService.js';
import { ExtensionManagementService } from '../../node/extensionManagementService.js';
import { IExtensionSignatureVerificationService } from '../../node/extensionSignatureVerificationService.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../uriIdentity/common/uriIdentityService.js';
import { IUserDataProfilesService } from '../../../userDataProfile/common/userDataProfile.js';

class TestDiskFileSystemProvider extends DiskFileSystemProvider {
	// ZIP creation uses real disk operations but does not need extension-directory watching.
	override watch(): IDisposable {
		return Disposable.None;
	}
}

suite('Native ExtensionManagementService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let root: URI;
	let fileService: FileService;
	let service: ExtensionManagementService;
	let downloadLocation: URI;

	setup(async () => {
		root = URI.file(await mkdtemp(join(tmpdir(), 'vscode-extension-zip-')));
		downloadLocation = joinPath(root, 'user-data', 'CachedExtensionVSIXs');
		const logService = new NullLogService();
		fileService = disposables.add(new FileService(logService));
		disposables.add(fileService.registerProvider(root.scheme, disposables.add(new TestDiskFileSystemProvider(logService))));
		const userExtensionsLocation = joinPath(root, 'extensions');
		await fileService.createFolder(userExtensionsLocation);

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IUriIdentityService, disposables.add(new UriIdentityService(fileService)));
		instantiationService.stub(INativeEnvironmentService, { extensionsDownloadLocation: downloadLocation });
		instantiationService.stub(IProductService, { quality: 'stable' });
		instantiationService.stub(IExtensionsScannerService, {
			userExtensionsLocation,
			initializeDefaultProfileExtensions: async () => { },
			scanAllUserExtensions: async () => [],
		});
		instantiationService.stub(IUserDataProfilesService, { profiles: [], onDidChangeProfiles: Event.None });
		instantiationService.stub(IExtensionsProfileScannerService, {
			onAddExtensions: Event.None,
			onDidAddExtensions: Event.None,
			onRemoveExtensions: Event.None,
			onDidRemoveExtensions: Event.None,
		});
		instantiationService.stub(IExtensionGalleryService, {});
		instantiationService.stub(ITelemetryService, {});
		instantiationService.stub(IDownloadService, {});
		instantiationService.stub(IConfigurationService, {});
		instantiationService.stub(IExtensionGalleryManifestService, {});
		instantiationService.stub(IAllowedExtensionsService, {});
		instantiationService.stub(IExtensionSignatureVerificationService, {});
		service = disposables.add(instantiationService.createInstance(ExtensionManagementService));
	});

	teardown(async () => {
		await rm(root.fsPath, { recursive: true, force: true });
	});

	test('zip creates a missing download cache and preserves extension files', async () => {
		const location = joinPath(root, 'installed-extension');
		const manifest = JSON.stringify({ name: 'test', publisher: 'publisher', version: '1.0.0', engines: { vscode: '*' } });
		await fileService.writeFile(joinPath(location, 'package.json'), VSBuffer.fromString(manifest));
		await fileService.writeFile(joinPath(location, 'lib', 'extension.js'), VSBuffer.fromString('exports.activate = () => {};'));
		const extension = new class extends mock<ILocalExtension>() {
			override readonly identifier = { id: 'publisher.test' };
			override readonly location = location;
		};

		assert.strictEqual(await fileService.exists(dirname(downloadLocation)), false);

		// A second archive also succeeds after the first call creates the cache.
		for (let i = 0; i < 2; i++) {
			const archive = await service.zip(extension);
			assert.deepStrictEqual({
				directory: dirname(archive).toString(),
				manifest: (await buffer(archive.fsPath, 'extension/package.json')).toString(),
				entrypoint: (await buffer(archive.fsPath, 'extension/lib/extension.js')).toString(),
			}, {
				directory: downloadLocation.toString(),
				manifest,
				entrypoint: 'exports.activate = () => {};',
			});
		}
	});
});
