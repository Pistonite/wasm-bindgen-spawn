# Playwright's official image ships chromium/firefox/webkit only. The branded
# browsers (google chrome and microsoft edge) install into the OS (/opt/...)
# and need root, so they have to be baked in here rather than set up when the
# container starts, which runs as pwuser.
#
# amd64 only: the chrome .deb is amd64 and the msedge installer explicitly
# refuses to run on arm64.
ARG PW_VERSION
FROM mcr.microsoft.com/playwright:v${PW_VERSION}-noble

# ARG has to be redeclared to be visible after FROM
ARG PW_VERSION

# the base image deletes its own playwright-core install at the end of its
# build, so put it back - we need it to install the branded browsers, and
# keeping it means run-server no longer fetches playwright from npm every time
# a container starts. installed globally so it's just on PATH; the upstream
# image uses a local /ms-playwright-agent project only because it installs from
# a tarball of an unreleased build, which doesn't apply to us
RUN npm i -g playwright-core@${PW_VERSION}

# system deps were already installed by the base image, so --with-deps is not needed
RUN playwright-core install chrome msedge \
    && rm -rf /var/lib/apt/lists/* /root/.npm

USER pwuser
WORKDIR /home/pwuser
