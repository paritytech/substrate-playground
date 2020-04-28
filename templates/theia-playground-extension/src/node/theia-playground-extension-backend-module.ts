import { ContainerModule } from 'inversify';
import { DownloadLinkHandler, FileDownloadHandler } from '@theia/filesystem/lib/node/download/file-download-handler';
import { PlaygroundMultiFileDownloadHandler, PlaygroundSingleFileDownloadHandler } from './file-download-handler';

export default new ContainerModule((bind, unbind) => {
    unbind(FileDownloadHandler);
    bind(FileDownloadHandler).to(PlaygroundSingleFileDownloadHandler).inSingletonScope().whenTargetNamed(FileDownloadHandler.SINGLE);
    bind(FileDownloadHandler).to(PlaygroundMultiFileDownloadHandler).inSingletonScope().whenTargetNamed(FileDownloadHandler.MULTI);
    bind(FileDownloadHandler).to(DownloadLinkHandler).inSingletonScope().whenTargetNamed(FileDownloadHandler.DOWNLOAD_LINK);
});
