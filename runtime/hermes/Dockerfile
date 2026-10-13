FROM docker.io/nousresearch/hermes-agent:latest

USER root

RUN mkdir -p /opt/m2

COPY runtime/hermes/start-hermes.sh /opt/m2/start-hermes.sh
COPY runtime/hermes/bridge.py /opt/m2/bridge.py

RUN chmod 0555 /opt/m2/start-hermes.sh /opt/m2/bridge.py

# Preserve the official Hermes ENTRYPOINT. Its main-wrapper executes an
# executable CMD directly after container bootstrap and privilege drop.
CMD ["/opt/m2/start-hermes.sh"]
